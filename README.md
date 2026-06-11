# hana-twitter-bot

凛（Rin）のTwitter自動投稿ボット。Geminiでツイート生成、fal.aiで画像生成、Next.jsダッシュボードで管理。

## サービス構成

| サービス | 役割 |
|---|---|
| `generator` (Python) | Geminiでシーン+ツイート生成 → fal.aiで画像生成 → DBに下書き保存 |
| `dashboard` (Next.js :3001) | 下書き確認・承認・スケジュール投稿 |
| `research-api` (FastAPI :8787) | リプライ草案生成API |
| `research-worker` | トレンド収集バックグラウンドジョブ |

## セットアップ

```bash
cp .env.example .env  # 各APIキーを設定
docker compose up -d
```

## 参照画像の運用ルール

`instant-character` モデルに渡す `REFERENCE_IMAGE_URL` の画像は **無彩色（off-white/neutral）の着物** で生成すること。

- **色付き着物を参照にしてはいけない**: 参照画像の着物色がプロンプトの色指定より優先され、何を指定してもピンク/花柄になる
- **顔だけ参照も不可**: 着物の構造情報が失われ、モデルが現代服やピンク花柄にデフォルトする
- **正解**: `flux-realism` で `plain undyed off-white kimono, completely solid neutral fabric, no pattern` を指定して生成した参照画像を使う
- 参照画像を作り直す場合は `compare_reference.py` を使って両案を比較してから採用すること

## 環境変数（主要）

| 変数 | 説明 |
|---|---|
| `GEMINI_API_KEY` | ツイート・シーン生成 |
| `FAL_KEY` | 画像生成 (instant-character / flux-realism) |
| `REFERENCE_IMAGE_URL` | 凛の参照画像URL（無彩色着物であること） |
| `TWITTER_API_KEY` 他 | 投稿用Twitter APIキー |
| `OPENROUTER_API_KEY` | リサーチ・リプライ草案生成 |
| `TAVILY_API_KEY` | トレンド収集検索 |
