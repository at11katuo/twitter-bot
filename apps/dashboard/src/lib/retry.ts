// 一時的なエラー（503/429/タイムアウト）にのみ指数バックオフでリトライする共通ヘルパー。
// プロンプト不正などの「リトライしても直らないエラー」は isRetryable が false を返し、即座に失敗させる。

export class TransientApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'TransientApiError'
    this.status = status
  }
}

const RETRYABLE_STATUS_CODES = new Set([429, 503])

export function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof TransientApiError) return true
  if (err instanceof Error && err.name === 'AbortError') return true
  // @fal-ai/client の ApiError は `.status` を持つ（duck typing で判定）
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status)
}

type RetryOptions = {
  /** ログに出す呼び出し元の識別名（例: "gemini", "fal.ai"） */
  label: string
  /** 初回失敗後の最大リトライ回数（デフォルト3 = 最大4回試行） */
  maxRetries?: number
  /** 1回目のリトライまでの待機ms（以降は2倍ずつ増加。デフォルト2000） */
  baseDelayMs?: number
  /** リトライ対象かどうかの判定（デフォルトは defaultIsRetryable） */
  isRetryable?: (err: unknown) => boolean
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { label } = options
  const maxRetries = options.maxRetries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 2000
  const isRetryable = options.isRetryable ?? defaultIsRetryable

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const retryable = isRetryable(err)

      if (!retryable) {
        if (attempt > 0) {
          console.error(`[retry] ${label}: 永続的エラーのため中止 (${attempt}回リトライ済み):`, err)
        }
        throw err
      }

      if (attempt >= maxRetries) {
        console.error(`[retry] ${label}: 最大リトライ回数(${maxRetries})に到達、断念:`, err)
        throw err
      }

      const delay = baseDelayMs * 2 ** attempt
      console.warn(`[retry] ${label}: 一時的エラー検知、${delay}ms後にリトライ (${attempt + 1}/${maxRetries}回目):`, err)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
