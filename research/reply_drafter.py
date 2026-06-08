"""
reply_drafter.py
凛（Rin）のキャラクターで、指定された投稿に対するリプライ下書き候補を生成する。
"""

import os
import json
import urllib.request
from dotenv import load_dotenv
load_dotenv()

from research.context_builder import get_season, get_character

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL   = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")


def draft_replies(
    post: str,
    author: str | None,
    n: int = 3,
    month: int | None = None,
) -> list[str]:
    """
    post に対する凛スタイルのリプライ候補を n 件返す。
    OPENROUTER_API_KEY 未設定時は RuntimeError を送出。
    """
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY が未設定です。")

    season = get_season(month)
    char   = get_character()

    author_line = f"@{author.lstrip('@')}: " if author else ""
    prompt = f"""You are generating reply tweet drafts for the Twitter account "凛（Rin）", \
a 20-year-old Japanese woman in seasonal kimono who warmly shares Japanese culture with international followers.

Character: {char['persona']}
Voice: {char['voice']['tone']}
Current season: {season['season_en']}
Seasonal mood: {season['mood']}
Key motifs this month: {', '.join(season['allow'][:5])}

Someone posted:
{author_line}{post}

Write {n} distinct reply draft candidates for Rin to post in response.

Rules:
- Warm, personal, elegant tone — as if sharing a cultural insight with a friend
- Max 120 characters each (fits Twitter reply)
- Reference Rin's personal feeling or experience in the moment
- Connect naturally to Japanese season, culture, or kimono
- DO NOT include hashtags
- DO NOT promote, advertise, or include URLs
- Output exactly {n} lines, one reply per line, no numbering or prefix"""

    payload = json.dumps({
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 400,
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

    text   = data["choices"][0]["message"]["content"].strip()
    drafts = [line.strip() for line in text.splitlines() if line.strip()]
    return drafts[:n]
