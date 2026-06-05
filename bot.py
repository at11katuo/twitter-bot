"""
bot.py  — 凛（Rin）自動投稿ボット

スケジュール:
  毎日 08:00 JST  平日: 画像ツイート  /  土日: Kling 動画ツイート
  毎日 22:00 JST  常時: 画像ツイート

実行方法:
  python bot.py            # schedule ループ（常駐）
  python bot.py morning    # 朝ジョブを即時1回実行
  python bot.py evening    # 夜ジョブを即時1回実行
"""

import os
import sys
import time
import logging
import datetime
import tempfile
import urllib.request
from pathlib import Path

import schedule
from dotenv import load_dotenv
import tweepy
import fal_client

from generator import (
    _ensure_fal_key,
    ensure_reference,
    generate_content,
    generate_fal_image,
)

load_dotenv()

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "bot.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# Kling 動画生成設定
# ------------------------------------------------------------------ #
KLING_MODEL = "fal-ai/kling-video/v2.6/pro/image-to-video"
KLING_PROMPT = (
    "Cinematic slow motion. The elegant woman in a kimono turns her head slightly "
    "to look directly into the camera with a soft, graceful smile. "
    "A gentle breeze beautifully flutters her hair."
)
KLING_TIMEOUT_SEC = 600  # 10分


# ------------------------------------------------------------------ #
# Twitter クライアント
# ------------------------------------------------------------------ #

def build_twitter_clients():
    api_key    = os.environ["TWITTER_API_KEY"]
    api_secret = os.environ["TWITTER_API_SECRET"]
    access_token        = os.environ["TWITTER_ACCESS_TOKEN"]
    access_token_secret = os.environ["TWITTER_ACCESS_TOKEN_SECRET"]

    auth = tweepy.OAuth1UserHandler(api_key, api_secret, access_token, access_token_secret)
    api_v1    = tweepy.API(auth)
    client_v2 = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )
    return api_v1, client_v2


# ------------------------------------------------------------------ #
# ファイルダウンロード
# ------------------------------------------------------------------ #

def download_file(url: str, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        tmp_path = f.name
    urllib.request.urlretrieve(url, tmp_path)
    return tmp_path


# ------------------------------------------------------------------ #
# Kling 動画生成
# ------------------------------------------------------------------ #

def generate_kling_video(image_path: str) -> str:
    """ローカル画像 → fal CDN アップロード → Kling で動画生成 → ローカルパスを返す。"""
    logger.info("[動画生成] fal.ai に画像をアップロード中...")
    fal_image_url = fal_client.upload_file(image_path)
    logger.info(f"[動画生成] アップロード完了: {fal_image_url[:60]}...")

    logger.info(f"[動画生成] Kling リクエスト送信: {KLING_MODEL}")
    handler = fal_client.submit(
        KLING_MODEL,
        arguments={
            "start_image_url": fal_image_url,
            "prompt": KLING_PROMPT,
            "duration": "5",
            "aspect_ratio": "9:16",
        },
    )

    start = time.time()
    for event in handler.iter_events(with_logs=False):
        elapsed = int(time.time() - start)
        if isinstance(event, fal_client.InProgress):
            logger.info(f"[動画生成] 処理中... ({elapsed}秒経過)")
        if elapsed > KLING_TIMEOUT_SEC:
            raise TimeoutError(f"Kling 動画生成がタイムアウトしました ({KLING_TIMEOUT_SEC}秒)")

    result = handler.get()
    video_url = result["video"]["url"]
    logger.info(f"[動画生成] 完了: {video_url[:60]}...")
    return download_file(video_url, ".mp4")


# ------------------------------------------------------------------ #
# Twitter 投稿
# ------------------------------------------------------------------ #

def post_with_image(tweet_text: str, image_path: str, api_v1, client_v2) -> str:
    logger.info("[投稿] 画像を Twitter にアップロード中...")
    media = api_v1.media_upload(filename=image_path)
    media_id = str(media.media_id)
    logger.info(f"[投稿] 画像アップロード完了 media_id={media_id}")
    response = client_v2.create_tweet(text=tweet_text, media_ids=[media_id])
    return response.data["id"]


def post_with_video(tweet_text: str, video_path: str, api_v1, client_v2) -> str:
    logger.info("[投稿] 動画を Twitter にチャンクアップロード中...")
    media = api_v1.media_upload(
        filename=video_path,
        chunked=True,
        media_category="tweet_video",
    )
    media_id = str(media.media_id)
    logger.info(f"[投稿] 動画アップロード完了 media_id={media_id}")

    # Twitter 側の動画エンコード完了を待つ
    processing_info = getattr(media, "processing_info", None)
    while processing_info:
        state = processing_info.get("state")
        if state == "succeeded":
            break
        if state == "failed":
            raise RuntimeError("Twitter 動画処理が失敗しました")
        wait = processing_info.get("check_after_secs", 5)
        logger.info(f"[投稿] 動画エンコード中... state={state} wait={wait}s")
        time.sleep(wait)
        media = api_v1.get_media_upload_status(media_id)
        processing_info = getattr(media, "processing_info", None)

    response = client_v2.create_tweet(text=tweet_text, media_ids=[media_id])
    return response.data["id"]


# ------------------------------------------------------------------ #
# ユーティリティ
# ------------------------------------------------------------------ #

def is_weekend_jst() -> bool:
    jst = datetime.timezone(datetime.timedelta(hours=9))
    return datetime.datetime.now(jst).weekday() >= 5  # 5=土, 6=日


# ------------------------------------------------------------------ #
# メインジョブ
# ------------------------------------------------------------------ #

def run_job(is_morning: bool) -> None:
    slot = "morning" if is_morning else "evening"
    logger.info(f"=== 自動投稿ジョブ開始 ({slot}) ===")

    image_path = None
    video_path = None

    try:
        _ensure_fal_key()
        reference_url = ensure_reference()
        scene_prompt, tweet_text = generate_content()

        logger.info(f"[シーン]   {scene_prompt}")
        logger.info(f"[ツイート] {tweet_text[:120]}")

        # 画像生成 → ローカル保存
        image_url  = generate_fal_image(scene_prompt, reference_url)
        image_path = download_file(image_url, ".png")

        api_v1, client_v2 = build_twitter_clients()

        # 土日 × 朝 → Kling 動画投稿
        if is_morning and is_weekend_jst():
            logger.info("[モード] 週末朝 → 動画生成 (Kling)")
            video_path = generate_kling_video(image_path)
            tweet_id = post_with_video(tweet_text, video_path, api_v1, client_v2)
            logger.info(f"[完了] 動画ツイート投稿成功 tweet_id={tweet_id}")
        else:
            logger.info("[モード] 平日 or 週末夜 → 画像投稿")
            tweet_id = post_with_image(tweet_text, image_path, api_v1, client_v2)
            logger.info(f"[完了] 画像ツイート投稿成功 tweet_id={tweet_id}")

    except Exception as e:
        logger.error(f"[エラー] ジョブ失敗: {e}", exc_info=True)

    finally:
        if image_path:
            Path(image_path).unlink(missing_ok=True)
        if video_path:
            Path(video_path).unlink(missing_ok=True)

    logger.info(f"=== ジョブ終了 ({slot}) ===")


def morning_job():
    run_job(is_morning=True)


def evening_job():
    run_job(is_morning=False)


# ------------------------------------------------------------------ #
# エントリーポイント
# ------------------------------------------------------------------ #

def main():
    logger.info("Bot 起動。毎日 08:00 / 22:00 JST に自動投稿します。")
    schedule.every().day.at("08:00").do(morning_job)
    schedule.every().day.at("22:00").do(evening_job)
    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if arg == "morning":
        morning_job()
    elif arg == "evening":
        evening_job()
    else:
        main()
