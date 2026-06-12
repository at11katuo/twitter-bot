"""
api.py — リサーチ機能の薄いHTTP API（方式A）。

ダッシュボード(Node)から fetch でPOSTし、リプライ下書き候補を受け取る。
既存の reply_drafter / context_builder をそのまま使う（ロジック二重管理なし）。
投稿APIは一切叩かない（送信は人間が手動）。

起動:
    pip install fastapi uvicorn requests pillow numpy
    OPENROUTER_API_KEY=xxx uvicorn research.api:app --host 0.0.0.0 --port 8787

エンドポイント:
    POST /reply-drafts   {"post": "...", "author": "@x", "n": 3}  -> {"drafts": [...]}
    POST /film-grade     {"image_b64": "...", "preset": "subtle"}  -> {"ok": true, "image_b64": "..."}
    GET  /kimono         ?month=6                                  -> 画像プロンプト一文
    GET  /healthz
"""

import base64
import os
import tempfile

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from research.reply_drafter import draft_replies
from research.context_builder import build_kimono_prompt
from research.film_grade import apply_film_look, PRESETS

app = FastAPI(title="twitter-bot research API")

# ダッシュボードのオリジンから叩けるようにCORS許可。
# 本番では allow_origins を実際のダッシュボードURLに絞ること。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReplyReq(BaseModel):
    post: str
    author: str | None = None
    tone: str | None = None
    n: int = 3
    month: int | None = None


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/reply-drafts")
def reply_drafts(req: ReplyReq):
    try:
        drafts = draft_replies(req.post, req.author, req.tone, req.n, req.month)
        return {"ok": True, "drafts": drafts}
    except Exception as e:
        return {"ok": False, "error": str(e), "drafts": []}


@app.get("/kimono")
def kimono(month: int | None = None):
    return {"prompt": build_kimono_prompt(month)}


class FilmGradeReq(BaseModel):
    image_b64: str
    preset: str = "subtle"


@app.post("/film-grade")
def film_grade(req: FilmGradeReq):
    preset = os.environ.get("FILM_PRESET", req.preset)
    if preset not in PRESETS:
        preset = "subtle"
    try:
        img_bytes = base64.b64decode(req.image_b64)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(img_bytes)
            tmp_path = f.name
        apply_film_look(tmp_path, preset=preset)
        with open(tmp_path, "rb") as f:
            result_b64 = base64.b64encode(f.read()).decode()
        return {"ok": True, "image_b64": result_b64, "preset": preset}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
