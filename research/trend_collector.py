"""
trend_collector.py
今月の季節トレンドを Web 検索 + OpenRouter LLM で要約し、
generator.py のプロンプトに注入できる文字列を返す。

キャッシュ先: DATABASE_URL が設定されていれば hana.db（LatestTrend テーブル）、
未設定またはDBアクセス不可の場合はファイルキャッシュにフォールバック。

必要な環境変数:
  OPENROUTER_API_KEY  (必須)
  TAVILY_API_KEY      (任意 — 未設定時は季節データのみにフォールバック)
  DATABASE_URL        (任意 — 未設定時はファイルキャッシュ)

使用例:
  from research.trend_collector import get_trend_context
  trend = get_trend_context()   # 今月で自動判定（キャッシュあり）
"""

import os
import json
import sqlite3
import datetime
import urllib.request
import urllib.error
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from research.context_builder import get_season

_HERE      = Path(__file__).parent
_CACHE_DIR = _HERE / ".cache"
_CACHE_DIR.mkdir(exist_ok=True)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TAVILY_API_KEY     = os.environ.get("TAVILY_API_KEY", "")
OPENROUTER_MODEL   = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")


# ------------------------------------------------------------------ #
# DB ユーティリティ
# ------------------------------------------------------------------ #

def _get_db_path() -> str | None:
    """DATABASE_URL から SQLite ファイルパスを返す。設定なし/解析不能時は None。"""
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return None
    path = url[len("file:"):] if url.startswith("file:") else url
    return path if path else None


def _load_cache_db(month: int, date: str) -> dict | None:
    db_path = _get_db_path()
    if not db_path or not Path(db_path).exists():
        return None
    try:
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                'SELECT context FROM "LatestTrend" WHERE month = ? AND date = ?',
                (month, date),
            ).fetchone()
            return {"context": row[0]} if row else None
    except Exception as e:
        print(f"[trend] DB読み込み失敗: {e}")
        return None


def _save_cache_db(month: int, date: str, data: dict) -> bool:
    db_path = _get_db_path()
    if not db_path or not Path(db_path).exists():
        return False
    try:
        import random, string
        now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        cuid = "c" + "".join(random.choices(string.ascii_lowercase + string.digits, k=24))
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                """INSERT INTO "LatestTrend" (id, month, date, context, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(month, date) DO UPDATE SET
                     context   = excluded.context,
                     updatedAt = excluded.updatedAt""",
                (cuid, month, date, data["context"], now, now),
            )
        return True
    except Exception as e:
        print(f"[trend] DB保存失敗: {e}")
        return False


# ------------------------------------------------------------------ #
# ファイルキャッシュ（DB 不使用時のフォールバック）
# ------------------------------------------------------------------ #

def _cache_path(month: int) -> Path:
    jst  = datetime.timezone(datetime.timedelta(hours=9))
    date = datetime.datetime.now(jst).strftime("%Y-%m-%d")
    return _CACHE_DIR / f"trend_{date}_m{month:02d}.json"


def _load_cache_file(month: int) -> dict | None:
    path = _cache_path(month)
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


def _save_cache_file(month: int, data: dict) -> None:
    with open(_cache_path(month), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------ #
# キャッシュ統合インターフェース（DB 優先、ファイルフォールバック）
# ------------------------------------------------------------------ #

def _load_cache(month: int) -> dict | None:
    jst  = datetime.timezone(datetime.timedelta(hours=9))
    date = datetime.datetime.now(jst).strftime("%Y-%m-%d")
    result = _load_cache_db(month, date)
    if result is not None:
        return result
    return _load_cache_file(month)


def _save_cache(month: int, data: dict) -> None:
    jst  = datetime.timezone(datetime.timedelta(hours=9))
    date = datetime.datetime.now(jst).strftime("%Y-%m-%d")
    saved_db = _save_cache_db(month, date, data)
    if saved_db:
        print("[trend] DBにキャッシュ保存")
    else:
        _save_cache_file(month, data)
        print("[trend] ファイルにキャッシュ保存（DBフォールバック）")


# ------------------------------------------------------------------ #
# Tavily 検索（任意）
# ------------------------------------------------------------------ #

def _search_tavily(query: str) -> list[str]:
    if not TAVILY_API_KEY:
        return []
    payload = json.dumps({
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": 5,
        "include_answer": True,
    }).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read())
            snippets = [r.get("content", "") for r in data.get("results", [])]
            if data.get("answer"):
                snippets.insert(0, data["answer"])
            return snippets[:5]
    except Exception as e:
        print(f"[trend] Tavily 検索失敗: {e}")
        return []


# ------------------------------------------------------------------ #
# OpenRouter 要約
# ------------------------------------------------------------------ #

def _summarize_openrouter(snippets: list[str], season: dict) -> str:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY が未設定です。")

    snippet_text = "\n\n".join(snippets[:5]) if snippets else "(no web data available)"
    prompt = f"""You are a cultural context assistant for a Japanese kimono beauty Twitter account.

Current season: {season['season_en']}
Seasonal mood: {season['mood']}
Key motifs: {', '.join(season['allow'][:5])}
Events: {', '.join(season['events'])}

Web search snippets (may be empty):
{snippet_text}

Based on the seasonal context (and web snippets if available), write 2–3 concise bullet points of:
- A culturally interesting fact or practice relevant to this month in Japan
- Something that resonates with international audiences interested in Japanese culture
- A subtle poetic angle that fits the mood

Keep it factual and brief. No hashtags. No preamble. Just the bullet points."""

    payload = json.dumps({
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 300,
    }).encode()

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read())
        return data["choices"][0]["message"]["content"].strip()


# ------------------------------------------------------------------ #
# メイン関数
# ------------------------------------------------------------------ #

def get_trend_context(month: int | None = None, force_refresh: bool = False) -> str:
    """
    今月の季節トレンドコンテキストを返す。
    キャッシュがあれば再利用（DB 優先、ファイルフォールバック）。
    OpenRouter 未設定時は空文字列を返す。
    """
    if month is None:
        jst = datetime.timezone(datetime.timedelta(hours=9))
        month = datetime.datetime.now(jst).month

    if not force_refresh:
        cached = _load_cache(month)
        if cached:
            db_path = _get_db_path()
            src = "DB" if (db_path and Path(db_path).exists()) else "ファイル"
            print(f"[trend] キャッシュ使用 ({src}, month={month})")
            return cached.get("context", "")

    if not OPENROUTER_API_KEY:
        print("[trend] OPENROUTER_API_KEY 未設定 — トレンドコンテキストをスキップ")
        return ""

    season   = get_season(month)
    query    = f"Japan {season['season_en']} culture kimono tradition"
    print(f"[trend] Web検索: {query}")
    snippets = _search_tavily(query)

    try:
        summary = _summarize_openrouter(snippets, season)
        context = f"\n=== CULTURAL TREND NOTES ({season['season_en']}) ===\n{summary}\n==="
        _save_cache(month, {"context": context, "month": month})
        print(f"[trend] 要約完了 ({len(summary)}文字)")
        return context
    except Exception as e:
        print(f"[trend] OpenRouter 要約失敗: {e}")
        return ""


if __name__ == "__main__":
    print(get_trend_context(force_refresh=True))
