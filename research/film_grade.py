"""
film_grade.py — 生成画像にフィルム写真の質感を後処理で焼き込む。

AI特有のツルッとした質感を消すため、生成パイプラインの最後に1関数挟むだけ:
    from research.film_grade import apply_film_look
    apply_film_look("generated.png", "final.png")          # デフォルト(subtle)
    apply_film_look("generated.png", "final.png", preset="portra")

処理内容（すべて決定的・顔の一貫性に影響しない）:
  1. カラーグレード: 彩度を落とし、ハイライトを軽く温色/シャドウを軽く寒色に
     (フィルムらしいソフトコントラストとトーン分離)
  2. ハレーション風のごく軽いハイライトのにじみ
  3. フィルムグレイン: 輝度依存のモノクロノイズ(暗部に多く、フィルムの挙動を模倣)
  4. ビネット: ごく弱い周辺減光

依存: pillow, numpy   (pip install pillow numpy)
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

# プリセット: (彩度, コントラスト, グレイン強度, ビネット強度, トーンシフト強度)
PRESETS = {
    # まずはここから。気づくか気づかないか程度に「写真化」する
    "subtle":  {"saturation": 0.90, "contrast": 0.97, "grain": 7.0,  "vignette": 0.12, "tone": 0.05},
    # Kodak Portra風: 柔らかく温かい、肌が綺麗に見える定番
    "portra":  {"saturation": 0.85, "contrast": 0.94, "grain": 10.0, "vignette": 0.18, "tone": 0.09},
    # 雨・曇天・情緒系に合う、彩度低めのシネマ調
    "muted":   {"saturation": 0.78, "contrast": 0.92, "grain": 9.0,  "vignette": 0.22, "tone": 0.12},
}


def _color_grade(arr: np.ndarray, tone: float) -> np.ndarray:
    """ハイライトを温色(微オレンジ)、シャドウを寒色(微ティール)に寄せるフィルム調トーン。"""
    luma = arr.mean(axis=2, keepdims=True) / 255.0  # 0..1
    # ハイライト側: R+ B- / シャドウ側: B+ R-
    warm = (luma - 0.5) * 2.0          # -1(暗)..+1(明)
    shift = warm * tone * 255.0
    out = arr.astype(np.float32)
    out[..., 0] += shift[..., 0]       # R: 明部で+, 暗部で-
    out[..., 2] -= shift[..., 0] * 0.8 # B: 明部で-, 暗部で+
    return np.clip(out, 0, 255)


def _film_grain(arr: np.ndarray, strength: float, rng: np.random.Generator) -> np.ndarray:
    """輝度依存グレイン。実フィルム同様、中間〜暗部に多めに乗せる。"""
    h, w = arr.shape[:2]
    luma = arr.mean(axis=2) / 255.0
    # 暗いほどノイズ大(0.4〜1.0倍)
    weight = (1.0 - luma) * 0.6 + 0.4
    noise = rng.normal(0.0, strength, (h, w)) * weight
    out = arr.astype(np.float32) + noise[..., None]  # RGB同値=モノクログレイン
    return np.clip(out, 0, 255)


def _vignette(arr: np.ndarray, strength: float) -> np.ndarray:
    """ごく弱い周辺減光。中心からの距離の2乗で減光。"""
    h, w = arr.shape[:2]
    y, x = np.ogrid[:h, :w]
    cy, cx = h / 2.0, w / 2.0
    r = np.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2) / np.sqrt(2)
    mask = 1.0 - strength * (r ** 2)
    return np.clip(arr.astype(np.float32) * mask[..., None], 0, 255)


def apply_film_look(
    src_path: str,
    dst_path: str | None = None,
    preset: str = "subtle",
    seed: int | None = None,
) -> str:
    """
    画像にフィルム質感を適用して保存。dst_path省略時は上書き。
    seedを固定すると同じグレインを再現できる(通常はNoneでよい)。
    戻り値: 保存先パス
    """
    p = PRESETS[preset]
    rng = np.random.default_rng(seed)

    img = Image.open(src_path).convert("RGB")

    # 1) ハレーション風: 明部だけを軽くぼかして薄く戻す
    blurred = img.filter(ImageFilter.GaussianBlur(radius=max(img.size) / 300))
    img = Image.blend(img, blurred, 0.12)

    # 2) 彩度・コントラストをフィルム寄りに
    img = ImageEnhance.Color(img).enhance(p["saturation"])
    img = ImageEnhance.Contrast(img).enhance(p["contrast"])

    arr = np.asarray(img, dtype=np.float32)

    # 3) トーンシフト → 4) グレイン → 5) ビネット
    arr = _color_grade(arr, p["tone"])
    arr = _film_grain(arr, p["grain"], rng)
    arr = _vignette(arr, p["vignette"])

    out = Image.fromarray(arr.astype(np.uint8), "RGB")
    dst = dst_path or src_path
    out.save(dst, quality=95)
    return dst


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Apply film look to an image")
    ap.add_argument("src")
    ap.add_argument("dst", nargs="?", default=None)
    ap.add_argument("--preset", choices=list(PRESETS), default="subtle")
    args = ap.parse_args()
    print("saved:", apply_film_look(args.src, args.dst, args.preset))
