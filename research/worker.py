"""
research/worker.py
Docker コンテナ内で毎日3:00 JST にトレンドデータを収集し hana.db へ保存する。
"""

import time
import datetime
from research.trend_collector import get_trend_context


def _seconds_until_next_run() -> int:
    """次回3:00 JSTまでの秒数を返す。"""
    jst = datetime.timezone(datetime.timedelta(hours=9))
    now = datetime.datetime.now(jst)
    next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
    if now >= next_run:
        next_run += datetime.timedelta(days=1)
    return int((next_run - now).total_seconds())


def main():
    print("[research-worker] 起動")
    while True:
        print("[research-worker] トレンド収集開始")
        get_trend_context(force_refresh=True)
        wait = _seconds_until_next_run()
        h, m = divmod(wait // 60, 60)
        print(f"[research-worker] 次回実行まで {h}時間{m}分 待機")
        time.sleep(wait)


if __name__ == "__main__":
    main()
