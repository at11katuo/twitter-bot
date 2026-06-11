"""
compare_reference.py
2種類の参照画像で同じシーン・同じ色（deep indigo）を3枚ずつ生成して比較する。

  参照A: 顔だけ（既存の reference.png / REFERENCE_IMAGE_URL）
  参照B: 無彩色着物（plain undyed off-white kimono）を新規生成

実行:
  python compare_reference.py
結果画像は ./compare_output/ に保存される。
"""

import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import fal_client

FAL_KEY = os.environ["FAL_KEY"]
os.environ["FAL_KEY"] = FAL_KEY

MODEL_REFERENCE  = "fal-ai/flux-realism"
MODEL_CHARACTER  = "fal-ai/instant-character"

PROMPT_NEUTRAL_KIMONO = (
    "A photorealistic portrait of a beautiful 20-year-old Japanese woman "
    "with a soft rounded jawline and gentle oval face shape, "
    "wearing a plain undyed off-white kimono, completely solid neutral fabric, "
    "no pattern no color, muted natural linen tone, wide kimono sleeves, "
    "formal Japanese garment silhouette, standing in a traditional Japanese garden, "
    "soft natural sunlight, shot on 35mm lens, highly detailed, 8k, "
    "serene expression, looking at camera, upper body shot"
)

# deep indigo で統一した比較用プロンプト
TEST_KIMONO_HINT = (
    "she is wearing a traditional Japanese kimono (着物), "
    "deep indigo colored with wide kimono sleeves and formal Japanese draping, "
    "hydrangea (ajisai) pattern, paired with a contrasting gold obi sash, NOT western clothes"
)
TEST_SCENE = "standing beside a koi pond at dusk, serene expression, gentle smile, soft golden light"
TEST_NEGATIVE = (
    "plastic skin, airbrushed, oversaturated, digital art, 3d render, cgi, "
    "overly smooth, perfect symmetry, glossy, western clothes, casual clothes, "
    "modern dress, shirt, jeans, pink"
)

OUT_DIR = Path("compare_output")
OUT_DIR.mkdir(exist_ok=True)


def generate_neutral_reference() -> str:
    """無彩色着物の参照画像を生成してURLを返す。"""
    print("[参照B] 無彩色着物参照画像を生成中...")
    result = fal_client.run(
        MODEL_REFERENCE,
        arguments={
            "prompt": PROMPT_NEUTRAL_KIMONO,
            "negative_prompt": "pink, red, colorful, pattern, floral, colored",
            "image_size": "portrait_4_3",
            "num_inference_steps": 35,
            "guidance_scale": 4.0,
            "num_images": 1,
            "enable_safety_checker": True,
        },
    )
    url = result["images"][0]["url"]
    urllib.request.urlretrieve(url, OUT_DIR / "ref_B_neutral_kimono.png")
    print(f"[参照B] 生成完了 → {url[:60]}...")

    print("[参照B] fal.ai にアップロード中...")
    upload_url = fal_client.upload_file(str(OUT_DIR / "ref_B_neutral_kimono.png"))
    print(f"[参照B] アップロード完了 → {upload_url[:60]}...")
    return upload_url


def generate_test_images(label: str, reference_url: str, n: int = 3) -> list[str]:
    """指定参照URLでテスト画像をn枚生成して保存。URLリストを返す。"""
    full_prompt = f"{TEST_KIMONO_HINT}, {TEST_SCENE}"
    print(f"\n[{label}] テスト生成開始 ({n}枚) prompt={full_prompt[:80]}...")
    urls = []
    for i in range(n):
        print(f"[{label}] {i+1}/{n} 枚目生成中...")
        result = fal_client.run(
            MODEL_CHARACTER,
            arguments={
                "image_url": reference_url,
                "prompt": full_prompt,
                "negative_prompt": TEST_NEGATIVE,
                "num_images": 1,
                "output_format": "png",
            },
        )
        url = result["images"][0]["url"]
        out_path = OUT_DIR / f"{label}_{i+1}.png"
        urllib.request.urlretrieve(url, out_path)
        print(f"[{label}] {i+1}枚目保存 → {out_path}")
        urls.append(url)
    return urls


def main():
    # 参照A: 既存の顔だけURL
    ref_a_url = os.environ.get("REFERENCE_IMAGE_URL", "").strip()
    if not ref_a_url:
        print("ERROR: REFERENCE_IMAGE_URL が .env に設定されていません")
        sys.exit(1)
    print(f"[参照A] 顔だけ参照URL: {ref_a_url[:60]}...")

    # 参照B: 無彩色着物を新規生成
    ref_b_url = generate_neutral_reference()

    # 両方でテスト生成
    generate_test_images("refA_face", ref_a_url, n=3)
    generate_test_images("refB_neutral", ref_b_url, n=3)

    print(f"\n=== 完了 ===")
    print(f"結果: {OUT_DIR}/")
    print(f"  ref_B_neutral_kimono.png  ← 無彩色着物参照画像")
    print(f"  refA_face_1.png ~ 3.png   ← 顔だけ参照で生成")
    print(f"  refB_neutral_1.png ~ 3.png ← 無彩色着物参照で生成")
    print(f"\n参照BのURL（採用する場合は .env に設定）:")
    print(f"  REFERENCE_IMAGE_URL={ref_b_url}")


if __name__ == "__main__":
    main()
