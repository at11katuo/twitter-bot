import os
import shutil
import logging
import schedule
import time
from pathlib import Path
from dotenv import load_dotenv
import tweepy

load_dotenv()

QUEUE_DIR = Path("queue")
POSTED_DIR = Path("posted")
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


def get_next_pair():
    """Return the first (image_path, txt_path) pair found in queue/, or (None, None)."""
    for ext in (".jpg", ".png"):
        for img_path in sorted(QUEUE_DIR.glob(f"*{ext}")):
            txt_path = img_path.with_suffix(".txt")
            if txt_path.exists():
                return img_path, txt_path
    return None, None


def build_clients():
    api_key = os.environ["API_KEY"]
    api_secret = os.environ["API_SECRET"]
    access_token = os.environ["ACCESS_TOKEN"]
    access_token_secret = os.environ["ACCESS_TOKEN_SECRET"]

    # v1.1 API (media upload)
    auth = tweepy.OAuth1UserHandler(api_key, api_secret, access_token, access_token_secret)
    api_v1 = tweepy.API(auth)

    # v2 Client (tweet creation)
    client_v2 = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )

    return api_v1, client_v2


def post_tweet():
    logger.info("=== Tweet job started ===")

    img_path, txt_path = get_next_pair()
    if img_path is None:
        logger.warning("No image+text pairs found in queue/. Nothing to post.")
        return

    tweet_text = txt_path.read_text(encoding="utf-8").strip()
    if not tweet_text:
        logger.error(f"{txt_path.name} is empty. Skipping.")
        return

    logger.info(f"Preparing to post: {img_path.name} / {txt_path.name}")

    try:
        api_v1, client_v2 = build_clients()

        # --- Step 1: Upload image via API v1.1 ---
        logger.info(f"Uploading image via v1.1: {img_path}")
        media = api_v1.media_upload(filename=str(img_path))
        media_id = str(media.media_id)
        logger.info(f"Image uploaded. media_id={media_id}")

        # --- Step 2: Post tweet via API v2 ---
        response = client_v2.create_tweet(text=tweet_text, media_ids=[media_id])
        tweet_id = response.data["id"]
        logger.info(f"Tweet posted successfully. tweet_id={tweet_id}")

        # --- Step 3: Move files to posted/ ---
        POSTED_DIR.mkdir(exist_ok=True)
        shutil.move(str(img_path), POSTED_DIR / img_path.name)
        shutil.move(str(txt_path), POSTED_DIR / txt_path.name)
        logger.info(f"Moved files to posted/: {img_path.name}, {txt_path.name}")

    except tweepy.TweepyException as e:
        logger.error(f"Tweepy error: {e}", exc_info=True)
    except KeyError as e:
        logger.error(f"Missing environment variable: {e}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)

    logger.info("=== Tweet job finished ===")


def main():
    QUEUE_DIR.mkdir(exist_ok=True)
    POSTED_DIR.mkdir(exist_ok=True)

    logger.info("Bot started. Scheduled daily post at 19:00.")

    schedule.every().day.at("19:00").do(post_tweet)

    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()
