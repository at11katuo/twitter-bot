"""
trend_collector.py
今月の季節トレンドを Web 検索 + OpenRouter LLM で要約し、
generator.py のプロンプトに注入できる文字列を返す。

必要な環境変数:
  OPENROUTER_API_KEY  (必須)
  TAVILY_API_KEY      (任意 — 未設定時は季節データのみにフォールバック)

使用例:
  from research.trend_collector import get_trend_context
  trend = get_trend_context()   # 今月で自動判定（キャッシュあり）
"""

import os
import json
import datetime
import urllib.request
import urllib.error
from pathlib import Path

from research.context_builder import get_season_data

_HERE        = Path(__file__).parent
_CACHE_DIR   = _HERE / ".cache"
_CACHE_DIR.mkdir(exist_ok=True)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TAVILY_API_KEY     = os.environ.get("TAVILY_API_KEY", "")
OPENROUTER_MODEL   = os.environ.get("OPENROUTER_MODEL", "google/gemini-flash-1.5")


# ------------------------------------------------------------------ #
# キャッシュ（1日1回で十分）
# ------------------------------------------------------------------ #

def _cache_path(month: int) -> Path:
    jst  = datetime.timezone(datetime.timedelta(hours=9))
    date = datetime.datetime.now(jst).strftime("%Y-%m-%d")
    return _CACHE_DIR / f"trend_{date}_m{month:02d}.json"


def _load_cache(month: int) -> dict | None:
    path = _cache_path(month)
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


def _save_cache(month: int, data: dict) -> None:
    with open(_cache_path(month), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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

Current season: {season['name_en']} ({season['name_ja']}) — {season['season']}
Seasonal mood: {season['mood']}
Key motifs: {', '.join(season['motifs']['allowed'][:5])}
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
    キャッシュがあれば再利用（1日1回の更新で十分）。
    OpenRouter 未設定時は空文字列を返す（フォールバック）。
    """
    if month is None:
        jst = datetime.timezone(datetime.timedelta(hours=9))
        month = datetime.datetime.now(jst).month

    if not force_refresh:
        cached = _load_cache(month)
        if cached:
            print(f"[trend] キャッシュ使用 (month={month})")
            return cached.get("context", "")

    if not OPENROUTER_API_KEY:
        print("[trend] OPENROUTER_API_KEY 未設定 — トレンドコンテキストをスキップ")
        return ""

    season = get_season_data(month)
    query  = f"Japan {season['name_en']} {season['season']} culture kimono tradition 2024"
    print(f"[trend] Web検索: {query}")
    snippets = _search_tavily(query)

    try:
        summary = _summarize_openrouter(snippets, season)
        context = f"\n=== CULTURAL TREND NOTES ({season['name_en']}) ===\n{summary}\n==="
        _save_cache(month, {"context": context, "month": month})
        print(f"[trend] 要約完了 ({len(summary)}文字)")
        return context
    except Exception as e:
        print(f"[trend] OpenRouter 要約失敗: {e}")
        return ""


if __name__ == "__main__":
    print(get_trend_context(force_refresh=True))
