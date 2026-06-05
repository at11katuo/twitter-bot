"""
bot.py  — 凛（Rin）自動生成ボット

コンテンツ（テキスト＋画像）を生成してダッシュボード DB に保存する。
Twitter への自動投稿は行わない。

スケジュール:
  毎日 08:00 JST  朝枠を1件生成
  毎日 22:00 JST  夜枠を1件生成

実行方法:
  python bot.py            # schedule ループ（常駐）
  python bot.py morning    # 朝ジョブを即時1回実行
  python bot.py evening    # 夜ジョブを即時1回実行
"""

import sys
import logging
from pathlib import Path

import schedule
import time
from dotenv import load_dotenv

from generator import run as generate_and_save

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


def run_job(slot: str) -> None:
    logger.info(f"=== 生成ジョブ開始 ({slot}) ===")
    try:
        generate_and_save()
        logger.info(f"=== 生成ジョブ完了 ({slot}) — ダッシュボードに保存済み ===")
    except Exception as e:
        logger.error(f"[エラー] ジョブ失敗: {e}", exc_info=True)


def morning_job():
    run_job("morning")


def evening_job():
    run_job("evening")


def main():
    logger.info("Bot 起動。毎日 08:00 / 22:00 JST に自動生成します。")
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
