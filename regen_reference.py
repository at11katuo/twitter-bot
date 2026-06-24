"""
regen_reference.py
改善された REFERENCE_PROMPT で参照画像を3枚生成し、
compare_output/ref_cand_001〜003.png に保存する。
選んだ番号を指定すると reference/ref_b.png に上書きコピーする。

使い方:
  python regen_reference.py           # 3枚生成
  python regen_reference.py --pick 2  # 2番を reference/ref_b.png に採用
"""
import os
import sys
import shutil
import argparse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

import fal_client
from generator import REFERENCE_PROMPT, FAL_MODEL_REFERENCE

FAL_KEY = os.environ.get("FAL_KEY", "")
if not FAL_KEY:
    sys.exit("FAL_KEY が未設定 (.env を確認してください)")
os.environ["FAL_KEY"] = FAL_KEY

EXPECTED_URL = "https://raw.githubusercontent.com/at11katuo/twitter-bot/main/reference/ref_b.png"

out_dir   = Path("compare_output")
ref_dir   = Path("reference")
ref_out   = ref_dir / "ref_b.png"
out_dir.mkdir(exist_ok=True)
ref_dir.mkdir(exist_ok=True)

def generate():
    print(f"[プロンプト]\n{REFERENCE_PROMPT}\n")
    print("3枚生成します（fal-ai/flux-realism）...\n")

    for i in range(1, 4):
        print(f"=== 生成 {i}/3 ===")
        result = fal_client.run(
            FAL_MODEL_REFERENCE,
            arguments={
                "prompt": REFERENCE_PROMPT,
                "image_size": "portrait_4_3",
                "num_inference_steps": 40,
                "guidance_scale": 4.5,
                "num_images": 1,
                "enable_safety_checker": True,
            },
        )
        url = result["images"][0]["url"]
        out_path = out_dir / f"ref_cand_{i:03d}.png"
        urllib.request.urlretrieve(url, str(out_path))
        print(f"  保存: {out_path}")

    print(f"\n完了。compare_output/ref_cand_001〜003.png を開いて確認してください。")
    print("採用する番号を選んだら:")
    print("  python regen_reference.py --pick 1  # または 2, 3")

def pick(n: int):
    src = out_dir / f"ref_cand_{n:03d}.png"
    if not src.exists():
        sys.exit(f"ERROR: {src} が見つかりません。先に python regen_reference.py を実行してください。")
    shutil.copy2(src, ref_out)
    print(f"[採用] {src} → {ref_out}")
    print()
    print("次のコマンドでコミット・プッシュしてください:")
    print(f"  git add reference/ref_b.png")
    print(f"  git commit -m 'Update reference image: gray kimono, full-body, obi visible'")
    print(f"  git push origin main")
    print()
    print(f"デプロイ後の REFERENCE_IMAGE_URL:")
    print(f"  {EXPECTED_URL}")

parser = argparse.ArgumentParser()
parser.add_argument("--pick", type=int, metavar="N", help="採用する画像番号 (1〜3)")
args = parser.parse_args()

if args.pick:
    pick(args.pick)
else:
    generate()
