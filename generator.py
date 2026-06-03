"""
generator.py
Gemini でツイート文＋Pollinations.ai 画像プロンプトを自動生成し、
queue/ に {連番}.txt / {連番}.png を保存する。
"""

import os
import re
import time
import urllib.request
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
import fal_client

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
FAL_KEY        = os.environ.get("FAL_KEY", "")   # fal.ai APIキー
QUEUE_DIR      = Path("queue")
QUEUE_DIR.mkdir(exist_ok=True)

# ------------------------------------------------------------------ #
# 使用モデル（変更する場合はここだけ書き換える）
# fal-ai/flux-realism    : 実写特化・着物美女に最適 ★推奨
# fal-ai/flux/dev        : 品質・コストバランス
# fal-ai/flux-pro/v1.1   : 最高品質（高コスト）
# ------------------------------------------------------------------ #
FAL_MODEL = "fal-ai/flux-realism"

# ------------------------------------------------------------------ #
# キャラクター固定ベースプロンプト
# このベース要素は絶対に変えない。背景・表情・ポーズのみ肉付けする。
# ------------------------------------------------------------------ #
IMAGE_BASE = (
    "photorealistic portrait of a beautiful 20-year-old Japanese woman "
    "wearing an elegant floral kimono, highly detailed, 8k --style raw --v 6.0"
)

# ------------------------------------------------------------------ #
# システムプロンプト（Gemini へのペルソナ＆指示）
# ------------------------------------------------------------------ #
SYSTEM_PROMPT = """あなたは日本の伝統美とAIアートを発信するTwitterアカウント「凛（Rin）」のコンテンツジェネレーターです。

【キャラクター設定：凛（Rin）】
- 20歳の日本女性。四季折々の着物を纏い、日本の伝統美・侘び寂びを体現する。
- 凛とした美しさの中に、優しさと品格を持つ。
- 毎日19時に投稿し、フォロワーに「今日も美しいものを見た」という体験を届ける。

【画像プロンプト生成ルール（厳守）】
Pollinations.ai 用の英語プロンプトを生成する際は、以下のベース要素を必ず骨格として含めること。
絶対に変更・省略してはならないベース：
"photorealistic portrait of a beautiful 20-year-old Japanese woman wearing an elegant floral kimono, highly detailed, 8k --style raw --v 6.0"

このベースに対し、以下の要素を英単語で自然に肉付けすること：
- 場所・背景（例: in a bamboo forest, beside a koi pond, at a traditional tea house, under cherry blossoms at dusk）
- 表情（例: gentle smile, serene expression, soft gaze into the distance）
- ポーズ・動作（例: holding a delicate teacup, arranging ikebana flowers, standing by a sliding shoji door）
- 光・雰囲気（例: soft morning light, golden hour, soft bokeh）

【ツイート文生成ルール】
- 日本語で50〜120文字。
- 凛（Rin）の一人称視点で、その日の風景・心情・着物の描写を詩的に書く。
- 末尾に必ず「#AI美女 #着物女子 #和装 #AIモデル #japanesekimono」を含める。
- 絵文字を1〜3個使い、余韻を残す文体にする。

【出力形式（厳守）】
IMAGE_PROMPT: {Pollinations.ai用英語プロンプト（1行）}
TWEET: {ツイート本文（日本語）}"""


def _next_index() -> int:
    """queue/ 内の既存ファイルから次の連番を決定する。"""
    existing = list(QUEUE_DIR.glob("[0-9]*.txt")) + list(QUEUE_DIR.glob("[0-9]*.png")) + list(QUEUE_DIR.glob("[0-9]*.jpeg"))
    if not existing:
        return 1
    nums = []
    for f in existing:
        m = re.match(r"(\d+)", f.stem)
        if m:
            nums.append(int(m.group(1)))
    return max(nums) + 1 if nums else 1


def generate_content(theme: str = "") -> tuple[str, str]:
    """
    Gemini でその日のテーマに合った画像プロンプトとツイート文を生成する。
    Returns (image_prompt, tweet_text)
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY が未設定です。")

    client = genai.Client(api_key=GEMINI_API_KEY)

    user_message = (
        f"今日のテーマ：{theme}" if theme
        else "今日の季節感や情景を自由に想像して、凛（Rin）らしい投稿を1件生成してください。"
    )

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                ),
            )
            text = response.text.strip()
            break
        except Exception as e:
            print(f"[警告] Gemini 生成失敗 (試行 {attempt}/{max_retries}): {e}")
            if attempt < max_retries:
                print("60秒待機して再試行...")
                time.sleep(60)
    else:
        raise RuntimeError("Gemini API の呼び出しが3回すべて失敗しました。")

    # IMAGE_PROMPT / TWEET を抽出
    img_match   = re.search(r"IMAGE_PROMPT:\s*(.+)", text)
    tweet_match = re.search(r"TWEET:\s*(.+)", text, re.DOTALL)

    if not img_match or not tweet_match:
        raise ValueError(f"Gemini の出力が期待形式ではありません:\n{text}")

    image_prompt = img_match.group(1).strip()
    tweet_text   = tweet_match.group(1).strip()

    # ベース要素が含まれているか検証・補完
    if IMAGE_BASE[:50] not in image_prompt:
        print("[警告] ベース要素が欠落しているため先頭に挿入します。")
        image_prompt = IMAGE_BASE + ", " + image_prompt

    return image_prompt, tweet_text


def download_image(prompt: str, save_path: Path, width: int = 1024, height: int = 1024) -> None:
    """fal.ai (FAL_MODEL) でプロンプトから画像を生成してダウンロードする。"""
    if not FAL_KEY:
        raise RuntimeError("FAL_KEY が未設定です。.env または環境変数に追加してください。")

    os.environ["FAL_KEY"] = FAL_KEY  # fal_client が env から読む

    print(f"[画像生成] モデル: {FAL_MODEL}")
    print(f"[プロンプト] {prompt[:80]}...")

    result = fal_client.run(
        FAL_MODEL,
        arguments={
            "prompt": prompt,
            "image_size": "square_hd",   # 1024x1024
            "num_inference_steps": 28,
            "guidance_scale": 3.5,
            "num_images": 1,
            "enable_safety_checker": True,
        },
    )

    image_url = result["images"][0]["url"]
    print(f"[ダウンロード] {image_url[:80]}...")
    urllib.request.urlretrieve(image_url, save_path)
    print(f"[保存] {save_path}")


def run(theme: str = "", count: int = 1) -> None:
    """
    theme: 今日の投稿テーマ（空白なら Gemini が自由生成）
    count: 生成件数
    """
    for i in range(count):
        idx = _next_index()
        print(f"\n=== 生成 {i+1}/{count}（queue番号: {idx:02d}）===")

        image_prompt, tweet_text = generate_content(theme)

        print(f"[プロンプト] {image_prompt}")
        print(f"[ツイート]  {tweet_text}")

        img_path = QUEUE_DIR / f"{idx:02d}.png"
        txt_path = QUEUE_DIR / f"{idx:02d}.txt"

        download_image(image_prompt, img_path)
        txt_path.write_text(tweet_text, encoding="utf-8")

        print(f"[完了] {img_path.name} + {txt_path.name} を queue/ に保存しました。")

        if i < count - 1:
            time.sleep(3)


if __name__ == "__main__":
    import sys
    theme_arg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    run(theme=theme_arg, count=1)
