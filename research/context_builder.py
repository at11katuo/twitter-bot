"""
context_builder.py — ①季節カレンダー注入 + ②キャラ固定 の中核。

外部DB・外部APIに一切依存しない。generator.py から呼び出して、
LLMに渡すプロンプトの「先頭」に注入する文字列を組み立てるだけ。

使い方（generator.py 側のイメージ）:
    from research.context_builder import build_full_context, build_kimono_prompt

    system_context = build_full_context()   # キャラ設定 + 季節制約（毎回先頭に固定）
    kimono         = build_kimono_prompt()  # 画像プロンプトに足す一文
"""

import json
import os
import random as _random
from datetime import date

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def _load(name: str) -> dict:
    with open(os.path.join(_DATA_DIR, name), "r", encoding="utf-8") as f:
        return json.load(f)


def get_season(month: int | None = None) -> dict:
    """今月（または指定月）の季節モチーフを返す。"""
    if month is None:
        month = date.today().month
    cal = _load("season_calendar.json")
    return cal[str(month)]


def get_character() -> dict:
    return _load("character_profile.json")


def build_system_context() -> str:
    """②キャラ固定: 毎回プロンプト先頭に置くキャラ宣言。"""
    c = get_character()
    do   = "\n".join(f"- {x}" for x in c["do"])
    dont = "\n".join(f"- {x}" for x in c["dont"])
    return (
        f"You are writing X (Twitter) posts as a persona named {c['name']} ({c['name_ja']}).\n"
        f"PERSONA: {c['persona']}\n"
        f"AUDIENCE: {c['audience']}\n"
        f"VOICE: {c['voice']['tone']}. {c['voice']['sentence_style']}. "
        f"Use {c['voice']['person']}, {c['voice']['tense']}.\n"
        f"LENGTH: {c['post_length']}\n"
        f"DO:\n{do}\n"
        f"DON'T:\n{dont}\n"
        f"Stay strictly in character. Output only the post text unless asked otherwise."
    )


def build_season_block(month: int | None = None) -> str:
    """①季節注入: 今月使ってよい/禁止モチーフと行事をLLMに強制する。"""
    s = get_season(month)
    allow  = ", ".join(s["allow"])
    ban    = ", ".join(s["ban"])
    events = ", ".join(s["events"])
    return (
        f"CURRENT SEASON: {s['season_en']}.\n"
        f"USE these seasonal motifs only: {allow}.\n"
        f"DO NOT mention (out of season): {ban}.\n"
        f"Relevant seasonal events you may reference: {events}.\n"
        f"Target mood: {s['mood']}."
    )


def build_full_context(month: int | None = None, research_snippet: str | None = None) -> str:
    """
    全部入り。research_snippet は③のリサーチ要約（任意）。
    リサーチが無くても季節+キャラだけで成立する＝フォールバック維持。
    """
    parts = [build_system_context(), build_season_block(month)]
    if research_snippet:
        parts.append(f"TODAY'S TRENDING ANGLES (optional inspiration):\n{research_snippet}")
    return "\n\n".join(parts)


# ============================================================
# 着物の柄バリエーション（季節柄＋たまに定番柄）
# ============================================================

def pick_kimono_pattern(month: int | None = None, seed: int | None = None) -> dict:
    """
    今月の季節柄、またはたまに定番柄を1つ選び、色・帯も添えて返す。
    返り値: {"pattern":..., "color":..., "obi":..., "is_classic":bool}
    seed を渡すと再現可能（同じ投稿で画像とキャプションを揃えたい時用）。
    """
    if month is None:
        month = date.today().month
    rng = _random.Random(seed)
    kp  = _load("kimono_patterns.json")

    use_classic = rng.random() < kp.get("classic_ratio", 0.25)
    if use_classic:
        pattern = rng.choice(kp["classic"])
    else:
        seasonal = kp["seasonal"].get(str(month)) or kp["classic"]
        pattern  = rng.choice(seasonal)

    color_pool = kp.get("seasonal_colors", {}).get(str(month)) or kp["colors"]
    return {
        "pattern":    pattern,
        "color":      rng.choice(color_pool),
        "obi":        rng.choice(kp["obi"]),
        "is_classic": use_classic,
    }


def build_kimono_prompt(month: int | None = None, seed: int | None = None) -> str:
    """画像生成プロンプトに足す句を返す。scenePrompt末尾にカンマ連結して使う。"""
    k = pick_kimono_pattern(month, seed)
    return f"wearing a {k['color']} kimono with {k['pattern']}, paired with {k['obi']}"


if __name__ == "__main__":
    print(build_full_context())
    print()
    print(build_kimono_prompt())
