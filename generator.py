"""
generator.py
① 初回のみ: reference.png（凛/Rin のベース顔）を fal-ai/flux-realism で生成
② 毎回    : Gemini がシーン + バイリンガルツイートを生成
            → fal-ai/instant-character + reference.png で同一人物を維持した画像を生成
            → ダッシュボード DB に下書き投稿として直接保存
"""

import os
import re
import sys
import time
import base64
import json
import random
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

try:
    from research.context_builder import build_full_context, build_kimono_prompt
    from research.trend_collector import get_trend_context
    from research.film_grade import apply_film_look
except ImportError:
    def build_full_context(**_): return ""
    def build_kimono_prompt(**_): return ""
    def get_trend_context(): return ""
    def apply_film_look(src, dst=None, preset="subtle", **_): return src or dst

# 画像品質サフィックス（research/data/image_config.json が単一定義元）
def _load_image_config() -> dict:
    _cfg_path = Path(__file__).parent / "research" / "data" / "image_config.json"
    try:
        with open(_cfg_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"quality_suffix": "", "negative_prompt": ""}

_IMAGE_CFG = _load_image_config()
QUALITY_SUFFIX   = _IMAGE_CFG.get("quality_suffix", "")
NEGATIVE_PROMPT  = _IMAGE_CFG.get("negative_prompt", "")
FILM_PRESET      = os.environ.get("FILM_PRESET", "subtle")

load_dotenv()

GEMINI_API_KEY       = os.environ.get("GEMINI_API_KEY", "")
FAL_KEY              = os.environ.get("FAL_KEY", "")
DASHBOARD_BASIC_USER = os.environ.get("DASHBOARD_BASIC_USER", "admin").strip()
DASHBOARD_BASIC_PASS = os.environ.get("DASHBOARD_BASIC_PASS", "changeme").strip()
DASHBOARD_URL        = os.environ.get("DASHBOARD_URL", "http://localhost:3001")

INTERNAL_SECRET = base64.b64encode(
    f"{DASHBOARD_BASIC_USER}:{DASHBOARD_BASIC_PASS}".encode()
).decode()

# ------------------------------------------------------------------ #
# モデル設定
# ------------------------------------------------------------------ #
FAL_MODEL_CHARACTER = "fal-ai/instant-character"
FAL_MODEL_REFERENCE = "fal-ai/flux-realism"

# ------------------------------------------------------------------ #
# リファレンスキャラクター設定
# ------------------------------------------------------------------ #
REFERENCE_IMAGE_PATH = Path("reference.png")
REFERENCE_URL_CACHE  = Path("reference_url.txt")

REFERENCE_PROMPT = (
    "A photorealistic close-up portrait of a beautiful 20-year-old Japanese woman, "
    "face and neck only, no clothing visible in frame, "
    "with a soft rounded jawline and gentle oval face shape, dark hair pinned up, "
    "soft studio lighting, neutral grey background, shot on 35mm lens, "
    "highly detailed, 8k, serene expression, looking at camera"
)

# ------------------------------------------------------------------ #
# ハッシュタグプール（外国人向け）
# ------------------------------------------------------------------ #
HASHTAG_POOL = [
    "#Japan", "#JapaneseCulture", "#Kimono", "#JapanTravel",
    "#WabiSabi", "#Sakura", "#TraditionalJapan", "#JapaneseBeauty",
    "#Washoku", "#Onsen", "#JapanLife", "#VisitJapan",
    "#JapaneseFashion", "#Zen", "#KimonoStyle",
]

# ------------------------------------------------------------------ #
# Gemini システムプロンプト
# ------------------------------------------------------------------ #
SYSTEM_PROMPT = """You are the content generator for the Twitter account "凛（Rin）", a beautiful 20-year-old Japanese woman in seasonal kimono who warmly shares Japanese culture with international followers.

【Character: 凛（Rin）】
- Embodies traditional Japanese beauty and grace
- Speaks warmly, elegantly, and personally — like a friend sharing a private moment
- ※ Visual appearance is fixed by reference image. Do NOT describe face, age, or appearance.

【SCENE_PROMPT Rules】
Write in English. Describe ONLY: background/location, pose/action, expression, lighting.
Do NOT mention kimono color or pattern — it is specified separately and will be appended automatically.

Required elements:
- Setting (e.g., "in a bamboo forest at dawn", "beside a koi pond", "under cherry blossoms at dusk")
- Pose/action (e.g., "holding a paper umbrella", "arranging ikebana flowers", "sipping matcha")
- Expression (e.g., "gentle smile", "serene gaze into the distance")
- Lighting (e.g., "soft morning light", "golden hour glow", "soft bokeh background")

Good example: "standing in a misty bamboo forest at dawn, holding a paper umbrella, serene expression, soft diffused light"

【TWEET Rules】
Theme: Japanese kimono, seasons, washoku (traditional food), famous sights, tea ceremony, ikebana, or festivals.
Tone: 凛 warmly addresses international followers, elegantly sharing a piece of Japan.

Write the tweet in EXACTLY this 3-line structure (no extra lines):
Line 1 [English]: MUST use first person "I" — describe Rin's own emotion, action, or experience in the moment. Max 100 chars, 1-2 emoji.
Line 2 [Romaji]: The same sentiment in romanized Japanese (max 70 chars)
Line 3 [Japanese]: Japanese text (max 50 chars, 1 emoji)

【Output Format (STRICT — follow exactly, no additions)】
SCENE_PROMPT: {English scene description (1 line)}
TWEET: {Line 1 English — must include "I", describing Rin's feeling or action, 1-2 emoji}
{Line 2 Romaji}
{Line 3 Japanese with 1 emoji}

Do NOT add hashtags. Do NOT add any extra lines. Output ends after Line 3."""


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
    env_url = os.environ.get("REFERENCE_IMAGE_URL", "").strip()
    if env_url:
        print(f"[キャッシュ] 環境変数からリファレンスURL取得: {env_url[:60]}...")
        return env_url
    if REFERENCE_URL_CACHE.exists():
        url = REFERENCE_URL_CACHE.read_text(encoding="utf-8").strip()
        if url:
            print(f"[キャッシュ] ファイルからリファレンスURL取得: {url[:60]}...")
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
    """Returns (scene_prompt, tweet_text_with_hashtags)"""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY が未設定です。")

    # 季節コンテキスト + キャラクター定義を注入
    trend_ctx = get_trend_context()  # OPENROUTER_API_KEY 未設定時は空文字
    enriched_system = f"{build_full_context(research_snippet=trend_ctx or None)}\n\n{SYSTEM_PROMPT}".strip()

    client = genai.Client(api_key=GEMINI_API_KEY)
    user_message = (
        f"Today's theme: {theme}" if theme
        else "Create a post for 凛（Rin）that feels true to this month's season and mood."
    )

    for attempt in range(1, 4):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_message,
                config=types.GenerateContentConfig(system_instruction=enriched_system),
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

    scene_prompt = scene_match.group(1).strip()

    # Gemini がハッシュタグを出力した場合は除去（コード側で付与するため）
    raw_body = tweet_match.group(1).strip()
    clean_lines = [l for l in raw_body.splitlines() if not l.strip().startswith("#")]
    tweet_body = "\n".join(clean_lines).strip()

    # ハッシュタグ厳密に4個・空行なし・1行で付与
    hashtags = " ".join(random.sample(HASHTAG_POOL, 4))
    tweet_text = f"{tweet_body}\n{hashtags}"

    return scene_prompt, tweet_text


# ------------------------------------------------------------------ #
# 画像生成（fal-ai/instant-character）
# ------------------------------------------------------------------ #

def generate_fal_image(scene_prompt: str, reference_url: str) -> str:
    """consistent-character でリファレンス人物 + シーンの画像URLを返す。"""
    print(f"[画像生成] モデル: {FAL_MODEL_CHARACTER}")
    print(f"[シーン]   {scene_prompt[:80]}...")
    args: dict = {
        "image_url": reference_url,
        "prompt": scene_prompt,
        "num_images": 1,
        "output_format": "png",
    }
    if NEGATIVE_PROMPT:
        args["negative_prompt"] = NEGATIVE_PROMPT
    result = fal_client.run(FAL_MODEL_CHARACTER, arguments=args)
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
        "theme": "rin-daily",
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

    apply_film_look(tmp_path, preset=FILM_PRESET)
    print(f"[フィルム] {FILM_PRESET} グレイン適用完了")

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
# メイン処理（ダッシュボード下書き保存のみ）
# ------------------------------------------------------------------ #

def run(theme: str = "", count: int = 1) -> None:
    reference_url = ensure_reference()

    for i in range(count):
        print(f"\n=== 生成 {i + 1}/{count} ===")

        scene_prompt, tweet_text = generate_content(theme)
        print(f"[シーン]   {scene_prompt}")
        print(f"[ツイート] {tweet_text}")

        post_id = create_post(tweet_text, scene_prompt)
        kimono_hint = build_kimono_prompt()
        fal_prompt  = f"{kimono_hint}, {scene_prompt}" if kimono_hint else scene_prompt
        if QUALITY_SUFFIX:
            fal_prompt = f"{fal_prompt}, {QUALITY_SUFFIX}"
        print(f"[falPrompt] {fal_prompt}")
        image_url = generate_fal_image(fal_prompt, reference_url)
        upload_image_to_dashboard(post_id, image_url)

        print(f"[完了] ダッシュボードに下書きを保存しました (ID: {post_id})")

        if i < count - 1:
            time.sleep(3)


if __name__ == "__main__":
    theme_arg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    run(theme=theme_arg, count=1)
