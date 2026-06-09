"""
reply_drafter.py — リプライ下書き生成（検知は手動・送信も手動）。

各リプライ候補に対し、(1)リプライ文 と (2)その文・相手のトーンに合わせた
凛の画像生成プロンプト（カメレオン戦術）をセットで返す。
送信・投稿は一切自動化しない（規約遵守）。

  from research.reply_drafter import draft_replies
  result = draft_replies(
      target_post="Misty winter shrine at dawn, utterly silent.",
      target_author="@wasabitool",
      tone="cold blue winter light, misty, serene",   # 方法B: 相手の写真トーンを一言
      n=3,
  )
  # result = [{"reply": "...", "image_prompt": "..."}, ...]

CLI:
  OPENROUTER_API_KEY=xxx python -m research.reply_drafter \
      --post "Misty winter shrine..." --author "@wasabitool" \
      --tone "cold blue winter light, misty" --n 3

依存: requests
"""

import argparse
import json
import os

import requests

from research.context_builder import (
    build_system_context,
    build_season_block,
    pick_kimono_pattern,
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-chat")

_REPLY_RULES = """
You draft a REPLY to someone else's post, AND an image prompt for an AI-generated
photo of Rin to attach. Follow the rules strictly.

REPLY rules:
- Praise something SPECIFIC about their post (not just "beautiful").
- Layer in Rin's quiet, poetic persona as her own feeling or experience.
- Stay fully in character. Warm, genuine, never spammy.
- ABSOLUTELY NO links, no 'follow me', no 'check my profile', no promo/affiliate.
- STRICT CHARACTER LIMIT: reply MUST be ≤ 140 characters total (including emoji).
  Count carefully. Cut ruthlessly. One tight sentence is better than two loose ones.
- 0-1 tasteful emoji max. Natural native English.
- Do not mention being AI.

IMAGE PROMPT rules (chameleon tactic — blend into their photo):
- Describe Rin in a kimono in a scene that MATCHES the target's tone/lighting/color
  so the image blends naturally with their post (no jarring contrast).
- Use the kimono pattern/color hint provided, but adjust lighting/mood to the tone.
- Keep it a concise comma-separated image prompt (for a text-to-image model).

Return ONLY a JSON array. Each item:
{"reply": "...", "reply_ja": "（日本語訳）", "image_prompt": "..."}
reply_ja is a natural Japanese translation of the reply (for human review only).
"""


def _build_user_prompt(target_post, author, tone, n, month):
    season = build_season_block(month)
    author = author or "the author"
    kimono_hints = []
    for _ in range(n):
        k = pick_kimono_pattern(month)
        kimono_hints.append(f"{k['color']} kimono with {k['pattern']}, {k['obi']}")
    hints_text = "\n".join(f"- option {i+1}: {h}" for i, h in enumerate(kimono_hints))

    tone_text = (
        f"TARGET POST TONE (match this in the image): {tone}"
        if tone else
        "TARGET POST TONE: not specified - infer a fitting tone from their post text."
    )

    return (
        f"{_REPLY_RULES}\n\n"
        f"{season}\n\n"
        f"{tone_text}\n\n"
        f"Kimono hints to use (one per option, match lighting to the tone):\n{hints_text}\n\n"
        f"You are replying to {author}, who posted:\n\"{target_post}\"\n\n"
        f"Generate {n} options as a JSON array of objects with keys 'reply' and 'image_prompt'."
    )


def draft_replies(target_post, target_author=None, tone=None, n=3, month=None):
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    resp = requests.post(
        OPENROUTER_URL,
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": build_system_context()},
                {"role": "user", "content": _build_user_prompt(target_post, target_author, tone, n, month)},
            ],
            "max_tokens": 700,
            "temperature": 0.9,
        },
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=90,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"].strip()
    content = content.replace("```json", "").replace("```", "").strip()

    try:
        items = json.loads(content)
        if isinstance(items, list):
            out = []
            for it in items[:n]:
                if isinstance(it, dict):
                    out.append({
                        "reply":       str(it.get("reply", "")).strip(),
                        "reply_ja":    str(it.get("reply_ja", "")).strip(),
                        "image_prompt": str(it.get("image_prompt", "")).strip(),
                    })
            if out:
                return out
    except json.JSONDecodeError:
        pass
    return [{"reply": content, "image_prompt": ""}]


def _cli():
    p = argparse.ArgumentParser(description="Generate manual-send reply drafts + matching image prompts")
    p.add_argument("--post", required=True)
    p.add_argument("--author", default=None)
    p.add_argument("--tone", default=None, help="Target photo tone, e.g. 'cold blue winter light, misty'")
    p.add_argument("--n", type=int, default=3)
    args = p.parse_args()

    items = draft_replies(args.post, args.author, args.tone, args.n)
    print("\n--- Reply drafts + image prompts (review, edit, send MANUALLY) ---\n")
    for i, it in enumerate(items, 1):
        print(f"[{i}] REPLY: {it['reply']}")
        print(f"    IMAGE: {it['image_prompt']}\n")
    print("Reminder: send by hand. No links/promo in replies. (X ToS)")


if __name__ == "__main__":
    _cli()
