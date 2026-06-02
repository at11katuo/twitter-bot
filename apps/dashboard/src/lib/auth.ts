export const COOKIE_NAME = 'hana_auth'
export const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function expectedToken(): string {
  const user = (process.env.DASHBOARD_BASIC_USER ?? 'admin').trim()
  const pass = (process.env.DASHBOARD_BASIC_PASS ?? 'changeme').trim()
  return Buffer.from(`${user}:${pass}`).toString('base64')
}
