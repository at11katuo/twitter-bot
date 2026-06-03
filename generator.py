"""
generator.py
① 初回のみ: reference.png（凛/Rin のベース顔）を fal-ai/flux-realism で生成
② 毎回    : Gemini がシーン（背景・表情・ポーズ）を生成
            → fal-ai/instant-character + reference.png で同一人物を維持した画像を生成
            → ダッシュボード DB に下書き投稿として直接保存
"""

import os
import re
import sys
import time
import base64
import json
import tempfile
import urllib.request
import urllib.parse

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
import fal_client

load_dotenv()

GEMINI_API_KEY       = os.environ.get("GEMINI_API_KEY", "")
FAL_KEY              = os.environ.get("FAL_KEY", "")
DASHBOARD_BASIC_USER = os.environ.get("DASHBOARD_BASIC_USER", "admin").strip()
DASHBOARD_BASIC_PASS = os.environ.get("DASHBOARD_BASIC_PASS", "changeme").strip()
DASHBOARD_URL        = os.environ.get("DASHBOARD_URL", "http://localhost:3001")

# Internal API secret = same base64 token used for cookie auth
INTERNAL_SECRET = base64.b64encode(
    f"{DASHBOARD_BASIC_USER}:{DASHBOARD_BASIC_PASS}".encode()
).decode()

# ------------------------------------------------------------------ #
# モデル設定（変更はここだけ）
# ------------------------------------------------------------------ #
FAL_MODEL_CHARACTER = "fal-ai/instant-character"
FAL_MODEL_REFERENCE = "fal-ai/flux-realism"

# ------------------------------------------------------------------ #
# リファレンスキャラクター設定
# ------------------------------------------------------------------ #
REFERENCE_IMAGE_PATH = Path("reference.png")
REFERENCE_URL_CACHE  = Path("reference_url.txt")

REFERENCE_PROMPT = (
    "A photorealistic portrait of a beautiful 20-year-old Japanese woman "
    "with a soft rounded jawline and gentle oval face shape, "
    "wearing an elegant floral kimono, standing in a traditional Japanese garden, "
    "soft natural sunlight, shot on 35mm lens, highly detailed, 8k, "
    "serene expression, looking at camera, upper body shot"
)

# ------------------------------------------------------------------ #
# Gemini システムプロンプト
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
    _ensure_fal_key()
    if not REFERENCE_IMAGE_PATH.exists():
        _generate_reference_image()
    return _get_reference_url()


# ------------------------------------------------------------------ #
# コンテンツ生成（Gemini）
# ------------------------------------------------------------------ #

def generate_content(theme: str = "") -> tuple[str, str]:
    """Returns (scene_prompt, tweet_text)"""
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
# 画像生成（fal-ai/instant-character）
# ------------------------------------------------------------------ #

def generate_fal_image(scene_prompt: str, reference_url: str) -> str:
    """consistent-character でリファレンス人物 + シーンの画像URLを返す。"""
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
    return result["images"][0]["url"]


# ------------------------------------------------------------------ #
# ダッシュボード API
# ------------------------------------------------------------------ #

def _api_request(path: str, data: bytes, content_type: str) -> dict:
    req = urllib.request.Request(
        f"{DASHBOARD_URL}{path}",
        data=data,
        headers={
            "Content-Type": content_type,
            "X-Internal-Secret": INTERNAL_SECRET,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read())


def create_post(tweet_text: str, scene_prompt: str) -> str:
    """ダッシュボード DB に下書き投稿を作成し post ID を返す。"""
    payload = json.dumps({
        "tweetText": tweet_text,
        "imagePrompt": scene_prompt,
        "slot": "evening",
        "theme": "hana-daily",
        "themeName": "Daily Post",
    }).encode()
    data = _api_request("/api/posts/new", payload, "application/json")
    post_id = data.get("id")
    if not post_id:
        raise RuntimeError(f"ダッシュボード API から ID が返りませんでした: {data}")
    print(f"[DB保存] 下書き作成完了 — post ID: {post_id}")
    return post_id


def upload_image_to_dashboard(post_id: str, image_url: str) -> None:
    """fal.ai の画像URLからダウンロードしてダッシュボードにアップロードする。"""
    print(f"[画像DL] {image_url[:80]}...")
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    urllib.request.urlretrieve(image_url, tmp_path)

    boundary = "----FormBoundary7MA4YWxkTrZu0gW"
    with open(tmp_path, "rb") as f:
        img_data = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="image.png"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + img_data + f"\r\n--{boundary}--\r\n".encode()

    result = _api_request(
        f"/api/upload/{post_id}",
        body,
        f"multipart/form-data; boundary={boundary}",
    )
    print(f"[画像保存] {result}")
    Path(tmp_path).unlink(missing_ok=True)


# ------------------------------------------------------------------ #
# メイン処理
# ------------------------------------------------------------------ #

def run(theme: str = "", count: int = 1) -> None:
    reference_url = ensure_reference()

    for i in range(count):
        print(f"\n=== 生成 {i + 1}/{count} ===")

        scene_prompt, tweet_text = generate_content(theme)
        print(f"[シーン]   {scene_prompt}")
        print(f"[ツイート] {tweet_text}")

        post_id = create_post(tweet_text, scene_prompt)
        image_url = generate_fal_image(scene_prompt, reference_url)
        upload_image_to_dashboard(post_id, image_url)

        print(f"[完了] ダッシュボードに下書きを保存しました (ID: {post_id})")

        if i < count - 1:
            time.sleep(3)


if __name__ == "__main__":
    theme_arg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    run(theme=theme_arg, count=1)
