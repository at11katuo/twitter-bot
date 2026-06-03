"""
generator.py
Gemini でツイート文＋画像プロンプトを生成し、
Pollinations.ai で画像をダウンロードしてダッシュボードDBに直接保存する。
"""

import os
import re
import time
import base64
import urllib.request
import urllib.parse
import urllib.error
import json
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY       = os.environ.get("GEMINI_API_KEY", "")
DASHBOARD_BASIC_USER = os.environ.get("DASHBOARD_BASIC_USER", "admin").strip()
DASHBOARD_BASIC_PASS = os.environ.get("DASHBOARD_BASIC_PASS", "changeme").strip()
DASHBOARD_URL        = os.environ.get("DASHBOARD_URL", "http://localhost:3001")

# Internal API secret = same base64 token used for cookie auth
INTERNAL_SECRET = base64.b64encode(
    f"{DASHBOARD_BASIC_USER}:{DASHBOARD_BASIC_PASS}".encode()
).decode()

# ------------------------------------------------------------------ #
# キャラクター固定ベースプロンプト
# ------------------------------------------------------------------ #
IMAGE_BASE = (
    "photorealistic portrait of a beautiful 20-year-old Japanese woman "
    "wearing an elegant floral kimono, highly detailed, 8k --style raw --v 6.0"
)

# ------------------------------------------------------------------ #
# システムプロンプト
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


def generate_content(theme: str = "") -> tuple[str, str]:
    """Returns (image_prompt, tweet_text)"""
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
            print(f"[警告] Gemini 生成失敗 (試行 {attempt}/3): {e}")
            if attempt < 3:
                print("60秒待機して再試行...")
                time.sleep(60)
    else:
        raise RuntimeError("Gemini API の呼び出しが3回すべて失敗しました。")

    img_match   = re.search(r"IMAGE_PROMPT:\s*(.+)", text)
    tweet_match = re.search(r"TWEET:\s*(.+)", text, re.DOTALL)

    if not img_match or not tweet_match:
        raise ValueError(f"Gemini の出力が期待形式ではありません:\n{text}")

    image_prompt = img_match.group(1).strip()
    tweet_text   = tweet_match.group(1).strip()

    if IMAGE_BASE[:50] not in image_prompt:
        print("[警告] ベース要素が欠落しているため先頭に挿入します。")
        image_prompt = IMAGE_BASE + ", " + image_prompt

    return image_prompt, tweet_text


def create_post(tweet_text: str, image_prompt: str) -> str:
    """ダッシュボード API に下書き投稿を作成し、post ID を返す。"""
    url = f"{DASHBOARD_URL}/api/posts/new"
    payload = json.dumps({
        "tweetText": tweet_text,
        "imagePrompt": image_prompt,
        "slot": "evening",
        "theme": "hana-daily",
        "themeName": "Daily Post",
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Secret": INTERNAL_SECRET,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read())

    post_id = data.get("id")
    if not post_id:
        raise RuntimeError(f"ダッシュボード API からIDが返りませんでした: {data}")
    print(f"[DB保存] 下書き作成完了 — post ID: {post_id}")
    return post_id


def upload_image(post_id: str, image_prompt: str) -> None:
    """Pollinations.ai から画像を生成してダッシュボードにアップロードする。"""
    encoded = urllib.parse.quote(image_prompt)
    img_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true"
    print(f"[画像生成] {img_url[:100]}...")

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name

    urllib.request.urlretrieve(img_url, tmp_path)
    print(f"[画像DL] 一時ファイル: {tmp_path}")

    upload_url = f"{DASHBOARD_URL}/api/upload/{post_id}"
    boundary = "----FormBoundary7MA4YWxkTrZu0gW"

    with open(tmp_path, "rb") as f:
        img_data = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="image.png"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + img_data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        upload_url,
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "X-Internal-Secret": INTERNAL_SECRET,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        result = json.loads(res.read())
    print(f"[画像保存] {result}")

    Path(tmp_path).unlink(missing_ok=True)


def run(theme: str = "", count: int = 1) -> None:
    for i in range(count):
        print(f"\n=== 生成 {i+1}/{count} ===")

        image_prompt, tweet_text = generate_content(theme)
        print(f"[プロンプト] {image_prompt}")
        print(f"[ツイート]  {tweet_text}")

        post_id = create_post(tweet_text, image_prompt)
        upload_image(post_id, image_prompt)

        print(f"[完了] ダッシュボードに下書きを保存しました (ID: {post_id})")

        if i < count - 1:
            time.sleep(3)


if __name__ == "__main__":
    import sys
    theme_arg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    run(theme=theme_arg, count=1)
