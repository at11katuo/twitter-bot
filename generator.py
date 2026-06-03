"""
generator.py
① 初回のみ: reference.png（凛/Rin のベース顔）を fal-ai/flux-realism で生成
② 毎回    : Gemini がシーン（背景・表情・ポーズ）を生成
            → fal-ai/consistent-character + reference.png で同一人物を維持した画像を生成
            → queue/{連番}.png / .txt に保存
"""

import os
import re
import sys
import time
import urllib.request

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
import fal_client

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
FAL_KEY        = os.environ.get("FAL_KEY", "")
QUEUE_DIR      = Path("queue")
QUEUE_DIR.mkdir(exist_ok=True)

# ------------------------------------------------------------------ #
# モデル設定（変更はここだけ）
# ------------------------------------------------------------------ #
FAL_MODEL_CHARACTER  = "fal-ai/instant-character"     # キャラクター一貫性モデル
FAL_MODEL_REFERENCE  = "fal-ai/flux-realism"          # 初回リファレンス生成用

# ------------------------------------------------------------------ #
# リファレンスキャラクター設定
# ------------------------------------------------------------------ #
REFERENCE_IMAGE_PATH = Path("reference.png")
REFERENCE_URL_CACHE  = Path("reference_url.txt")

# リファレンス生成用プロンプト（初回1回だけ使用）
REFERENCE_PROMPT = (
    "A photorealistic portrait of a beautiful 20-year-old Japanese woman "
    "wearing an elegant floral kimono, standing in a traditional Japanese garden, "
    "soft natural sunlight, shot on 35mm lens, highly detailed, 8k, "
    "serene expression, looking at camera, upper body shot"
)

# ------------------------------------------------------------------ #
# Gemini システムプロンプト
# consistent-character はキャラクターを reference.png から取得するため
# Gemini はシーン（背景・ポーズ・表情・光）の英語描写だけを出力する
# ------------------------------------------------------------------ #
SYSTEM_PROMPT = """あなたは日本の伝統美とAIアートを発信するTwitterアカウント「凛（Rin）」のコンテンツジェネレーターです。

【キャラクター：凛（Rin）】
- 20歳の日本女性。四季折々の着物を纏い、日本の伝統美を体現する。
- 凛とした美しさ、優しさ、品格を持つ。
- ※キャラクターのビジュアルはリファレンス画像で固定済み。プロンプトに顔・年齢・人物描写は不要。

【SCENE_PROMPT 生成ルール（厳守）】
英語で「シーン・背景・表情・ポーズ・光」のみを描写する。キャラクターの外見（顔・年齢・服）は書かない。

必ず含める要素：
- 着物の柄・色（例: wearing a deep indigo kimono with golden chrysanthemum patterns）
- 背景・場所（例: in a bamboo forest, beside a koi pond, at a traditional tea house, under cherry blossoms at dusk）
- ポーズ・動作（例: holding a delicate teacup, arranging ikebana flowers, gazing at falling petals）
- 表情（例: gentle smile, serene expression, soft gaze into the distance）
- 光・雰囲気（例: soft morning light, golden hour glow, soft bokeh background）

良い例: "wearing a deep indigo kimono with golden chrysanthemum patterns, standing in a misty bamboo forest at dawn, soft diffused light, holding a paper umbrella, serene expression"

【ツイート文生成ルール】
- 日本語50〜120文字。
- 凛（Rin）の一人称で、その日の風景・心情・着物の描写を詩的に書く。
- 末尾に必ず「#AI美女 #着物女子 #和装 #AIモデル #japanesekimono」を含める。
- 絵文字1〜3個使用。余韻を残す文体。

【出力形式（厳守）】
SCENE_PROMPT: {英語シーン描写（1行）}
TWEET: {ツイート本文（日本語）}"""


# ------------------------------------------------------------------ #
# リファレンス画像の初期化
# ------------------------------------------------------------------ #

def _ensure_fal_key() -> None:
    if not FAL_KEY:
        raise RuntimeError("FAL_KEY が未設定です。.env に FAL_KEY=xxx を追加してください。")
    os.environ["FAL_KEY"] = FAL_KEY


def _generate_reference_image() -> None:
    """初回のみ: flux-realism でリファレンス画像を生成して reference.png に保存する。"""
    print("[初期化] リファレンス画像を生成します（初回のみ）...")
    print(f"[モデル] {FAL_MODEL_REFERENCE}")

    result = fal_client.run(
        FAL_MODEL_REFERENCE,
        arguments={
            "prompt": REFERENCE_PROMPT,
            "image_size": "portrait_4_3",
            "num_inference_steps": 35,
            "guidance_scale": 4.0,
            "num_images": 1,
            "enable_safety_checker": True,
        },
    )
    image_url = result["images"][0]["url"]
    urllib.request.urlretrieve(image_url, REFERENCE_IMAGE_PATH)
    print(f"[完了] {REFERENCE_IMAGE_PATH} に保存しました。")


def _get_reference_url() -> str:
    """
    reference.png を fal.ai にアップロードして URL を返す。
    URL は reference_url.txt にキャッシュし、次回以降は再利用する。
    """
    if REFERENCE_URL_CACHE.exists():
        url = REFERENCE_URL_CACHE.read_text(encoding="utf-8").strip()
        if url:
            print(f"[キャッシュ] リファレンスURL: {url[:60]}...")
            return url

    print("[アップロード] reference.png を fal.ai にアップロード中...")
    url = fal_client.upload_file(str(REFERENCE_IMAGE_PATH))
    REFERENCE_URL_CACHE.write_text(url, encoding="utf-8")
    print(f"[完了] URL をキャッシュしました: {url[:60]}...")
    return url


def ensure_reference() -> str:
    """
    reference.png がなければ生成し、fal.ai URL を返す。
    2回目以降はキャッシュから即返す。
    """
    _ensure_fal_key()
    if not REFERENCE_IMAGE_PATH.exists():
        _generate_reference_image()
    return _get_reference_url()


# ------------------------------------------------------------------ #
# コンテンツ生成（Gemini）
# ------------------------------------------------------------------ #

def _next_index() -> int:
    existing = (
        list(QUEUE_DIR.glob("[0-9]*.txt"))
        + list(QUEUE_DIR.glob("[0-9]*.png"))
        + list(QUEUE_DIR.glob("[0-9]*.jpeg"))
    )
    if not existing:
        return 1
    nums = [int(m.group(1)) for f in existing if (m := re.match(r"(\d+)", f.stem))]
    return max(nums) + 1 if nums else 1


def generate_content(theme: str = "") -> tuple[str, str]:
    """Gemini でシーンプロンプトとツイート文を生成する。"""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY が未設定です。")

    client = genai.Client(api_key=GEMINI_API_KEY)
    user_message = (
        f"今日のテーマ：{theme}" if theme
        else "今日の季節感や情景を自由に想像して、凛（Rin）らしい投稿を1件生成してください。"
    )

    for attempt in range(1, 4):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_message,
                config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            )
            text = response.text.strip()
            break
        except Exception as e:
            print(f"[警告] Gemini 失敗 (試行 {attempt}/3): {e}")
            if attempt < 3:
                print("60秒待機して再試行...")
                time.sleep(60)
    else:
        raise RuntimeError("Gemini API が3回すべて失敗しました。")

    scene_match = re.search(r"SCENE_PROMPT:\s*(.+)", text)
    tweet_match = re.search(r"TWEET:\s*(.+)", text, re.DOTALL)

    if not scene_match or not tweet_match:
        raise ValueError(f"Gemini の出力が期待形式ではありません:\n{text}")

    return scene_match.group(1).strip(), tweet_match.group(1).strip()


# ------------------------------------------------------------------ #
# 画像生成（fal-ai/consistent-character）
# ------------------------------------------------------------------ #

def generate_image(scene_prompt: str, reference_url: str, save_path: Path) -> None:
    """consistent-character でリファレンス人物 + シーンの画像を生成して保存する。"""
    print(f"[画像生成] モデル: {FAL_MODEL_CHARACTER}")
    print(f"[シーン]   {scene_prompt[:80]}...")

    result = fal_client.run(
        FAL_MODEL_CHARACTER,
        arguments={
            "image_url": reference_url,
            "prompt": scene_prompt,
            "num_images": 1,
            "output_format": "png",
        },
    )

    image_url = result["images"][0]["url"]
    urllib.request.urlretrieve(image_url, save_path)
    print(f"[保存] {save_path}")


# ------------------------------------------------------------------ #
# メイン処理
# ------------------------------------------------------------------ #

def run(theme: str = "", count: int = 1) -> None:
    reference_url = ensure_reference()

    for i in range(count):
        idx = _next_index()
        print(f"\n=== 生成 {i + 1}/{count}（queue番号: {idx:02d}）===")

        scene_prompt, tweet_text = generate_content(theme)
        print(f"[シーン]   {scene_prompt}")
        print(f"[ツイート] {tweet_text}")

        img_path = QUEUE_DIR / f"{idx:02d}.png"
        txt_path = QUEUE_DIR / f"{idx:02d}.txt"

        generate_image(scene_prompt, reference_url, img_path)
        txt_path.write_text(tweet_text, encoding="utf-8")

        print(f"[完了] {img_path.name} + {txt_path.name} を queue/ に保存しました。")

        if i < count - 1:
            time.sleep(3)


if __name__ == "__main__":
    import sys
    theme_arg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    run(theme=theme_arg, count=1)
