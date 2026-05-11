/**
 * GET /api/link/tags
 *
 * 返回当前用户(或全部 admin 看见)的所有标签 + 每个标签的链接数。
 *
 * 用于:
 *   - 编辑器里的标签自动联想
 *   - 列表筛选下拉
 *   - 标签统计页
 */
export default eventHandler(async (event) => {
  const currentUser = requireAuth(event)
  const DB = (event.context as any)?.cloudflare?.env?.DB
  if (!DB) {
    return { tags: [] }
  }

  try {
    const isAdmin = currentUser.role === 'admin'
    const sql = isAdmin
      ? 'SELECT tags FROM links WHERE tags IS NOT NULL AND tags != ""'
      : 'SELECT tags FROM links WHERE owner = ? AND tags IS NOT NULL AND tags != ""'

    const stmt = isAdmin ? DB.prepare(sql) : DB.prepare(sql).bind(currentUser.username)
    const result = await stmt.all()
    const rows = result?.results || []

    // 统计每个标签的出现次数
    const counter = new Map<string, number>()
    for (const r of rows as any[]) {
      try {
        const arr = JSON.parse(r.tags)
        if (Array.isArray(arr)) {
          for (const t of arr) {
            if (typeof t === 'string' && t.trim()) {
              const key = t.trim().toLowerCase()
              counter.set(key, (counter.get(key) || 0) + 1)
            }
          }
        }
      }
      catch {
        // 跳过格式错的
      }
    }

    // 按计数倒序
    const tags = [...counter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return { tags }
  }
  catch (err: any) {
    console.error('[tags] 查询失败:', err)
    return { tags: [] }
  }
})