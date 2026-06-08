"""
context_builder.py
外部API・DB不要。season_calendar.json + character_profile.json から
Gemini プロンプトに注入するコンテキスト文字列を組み立てる。

使用例:
    from research.context_builder import build_full_context
    ctx = build_full_context()          # 今月で自動判定
    ctx = build_full_context(month=6)   # 月を指定
"""

import json
import datetime
from pathlib import Path

_HERE = Path(__file__).parent
_CALENDAR_PATH  = _HERE / "season_calendar.json"
_CHARACTER_PATH = _HERE / "character_profile.json"


def _load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_season_data(month: int | None = None) -> dict:
    """指定月（未指定なら現在月JST）の季節データを返す。"""
    if month is None:
        jst = datetime.timezone(datetime.timedelta(hours=9))
        month = datetime.datetime.now(jst).month
    calendar = _load_json(_CALENDAR_PATH)
    return calendar[str(month)]


def get_character_profile() -> dict:
    return _load_json(_CHARACTER_PATH)


def build_full_context(month: int | None = None) -> str:
    """
    Gemini システムプロンプトの先頭に差し込む季節×キャラクター文脈を返す。
    Returns a plain string ready to prepend to any existing system prompt.
    """
    season = get_season_data(month)
    char   = get_character_profile()

    allowed_str  = ", ".join(season["allow"])
    forbidden_str = ", ".join(season["ban"])
    events_str   = ", ".join(season["events"])

    do_str   = "; ".join(char["do"])
    dont_str = "; ".join(char["dont"])
    tf       = char["tweet_format"]

    context = f"""=== SEASONAL CONTEXT ({season['season_en']}) ===
Mood: {season['mood']}

Use these motifs: {allowed_str}
Do NOT use (out of season): {forbidden_str}

Events this month: {events_str}
Kimono styling hint: {season['kimono_hint']}

=== CHARACTER: {char['name']} ({char['name_ja']}) ===
Persona: {char['persona']}
Voice: {char['voice']['tone']}
Sentence style: {char['voice']['sentence_style']}
Audience: {char['audience']}

DO: {do_str}
DONT: {dont_str}

Tweet format: {tf['structure']}
  • English line: {tf['english_line']}
  • Romaji line:  {tf['romaji_line']}
  • Japanese line: {tf['japanese_line']}
  • Hashtags: {tf['hashtags']}

==="""
    return context.strip()


def build_kimono_prompt(month: int | None = None) -> str:
    """今月の季節に合った一文の着物画像プロンプトを返す（/kimono エンドポイント用）。"""
    season = get_season_data(month)
    motifs = ", ".join(season["allow"][:3])
    return (
        f"A beautiful 20-year-old Japanese woman in {season['kimono_hint']}, "
        f"surrounded by {motifs}, "
        f"{season['mood'].lower()}, soft natural light, traditional Japanese setting"
    )


def get_forbidden_motifs(month: int | None = None) -> list[str]:
    """今月の禁止モチーフリストを返す（プロンプト検証用）。"""
    return get_season_data(month)["ban"]


def get_allowed_motifs(month: int | None = None) -> list[str]:
    """今月の推奨モチーフリストを返す。"""
    return get_season_data(month)["allow"]


if __name__ == "__main__":
    print(build_full_context())
