/**
 * GET /api/admin/security/locked-users
 * 列出当前被锁定的所有 username
 */
export default eventHandler(async (event) => {
  requireAdmin(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const list = await KV.list({ prefix: 'login_fail:user:' })
  const now = Math.floor(Date.now() / 1000)
  const items: Array<{ username: string, count: number, lockedUntil: number, remainingSeconds: number }> = []

  for (const key of list.keys || []) {
    const record = await KV.get(key.name, { type: 'json' }) as { count: number, lockedUntil?: number } | null
    if (!record) continue
    const username = key.name.replace('login_fail:user:', '')
    if (record.lockedUntil && record.lockedUntil > now) {
      items.push({
        username,
        count: record.count,
        lockedUntil: record.lockedUntil,
        remainingSeconds: record.lockedUntil - now,
      })
    }
  }

  // 按剩余时间排序
  items.sort((a, b) => b.remainingSeconds - a.remainingSeconds)

  return { items, total: items.length }
})