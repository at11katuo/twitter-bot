"""
regen_reference.py
REFERENCE_PROMPT（品質指定版）で参照画像を3枚生成し、
compare_output/ref_quality_NNN.png に保存する。
最も良い1枚を選んで fal.ai にアップロードし、
サーバーの .env に設定すべき REFERENCE_IMAGE_URL を表示する。
"""
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv()

import fal_client
from generator import REFERENCE_PROMPT, FAL_MODEL_REFERENCE

FAL_KEY = os.environ.get("FAL_KEY", "")
if not FAL_KEY:
    sys.exit("FAL_KEY が未設定")
os.environ["FAL_KEY"] = FAL_KEY

out_dir = Path("compare_output")
out_dir.mkdir(exist_ok=True)

print(f"[プロンプト]\n{REFERENCE_PROMPT}\n")
print("3枚生成します...\n")

urls = []
for i in range(1, 4):
    print(f"=== 生成 {i}/3 ===")
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
    url = result["images"][0]["url"]
    out_path = out_dir / f"ref_quality_{i:03d}.png"
    urllib.request.urlretrieve(url, str(out_path))
    print(f"  保存: {out_path}  fal URL: {url[:60]}...")

print(f"\n完了。compare_output/ref_quality_001〜003.png を確認して")
print("最も良い1枚の番号を選んだら、次のコマンドでアップロードします：")
print()
print("  python -c \"")
print("import os, sys, fal_client")
print("from dotenv import load_dotenv; load_dotenv()")
print("os.environ['FAL_KEY'] = os.environ.get('FAL_KEY', '')")
print("url = fal_client.upload_file('compare_output/ref_quality_001.png')  # 番号変えてください")
print("print('REFERENCE_IMAGE_URL=' + url)")
print("\"")
