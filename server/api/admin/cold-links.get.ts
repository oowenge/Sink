/**
 * GET /api/admin/cold-links
 *
 * 列出"冷链接"——即指定天数内没有访问的链接。
 *
 * Query params:
 *   - days: 冷链接判定阈值(天数),默认 30,范围 1-3650
 *   - limit: 返回条数,默认 100,最大 1000
 *
 * 判定逻辑:
 *   一条链接同时满足以下两个条件就是"冷":
 *   1. 创建时间早于 (now - days) - 排除新链接
 *   2. last_accessed_at < (now - days) 或 last_accessed_at = 0 - 没访问过或访问久远
 */
import { z } from 'zod'

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(30),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

export default eventHandler(async (event) => {
  requireAdmin(event)
  const query = await getValidatedQuery(event, QuerySchema.parse)

  const DB = (event.context as any)?.cloudflare?.env?.DB
  if (!DB) {
    throw createError({
      status: 503,
      statusText: 'Service Unavailable',
      message: 'D1 数据库未连接',
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const threshold = now - query.days * 24 * 60 * 60

  try {
    // 满足两个条件:created_at 也早于阈值 + 最后访问早于阈值(或从未访问)
    const sql = `
      SELECT
        slug, url, owner, comment,
        created_at, updated_at, last_accessed_at,
        rules
      FROM links
      WHERE created_at < ?
        AND (last_accessed_at IS NULL OR last_accessed_at < ?)
      ORDER BY
        CASE WHEN last_accessed_at IS NULL OR last_accessed_at = 0 THEN 0 ELSE last_accessed_at END ASC,
        created_at ASC
      LIMIT ?
    `
    const result = await DB.prepare(sql).bind(threshold, threshold, query.limit).all()
    const rows = result?.results || []

    // 同时统计所有冷链接总数(可能超过 limit 的不会显示在列表里)
    const countSql = `
      SELECT COUNT(*) as cnt FROM links
      WHERE created_at < ?
        AND (last_accessed_at IS NULL OR last_accessed_at < ?)
    `
    const countResult = await DB.prepare(countSql).bind(threshold, threshold).first()
    const totalCold = countResult?.cnt ?? 0

    // 返回前端友好格式
    const items = rows.map((r: any) => ({
      slug: r.slug,
      url: r.url,
      owner: r.owner,
      comment: r.comment,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastAccessedAt: r.last_accessed_at || 0,
      hasRules: !!r.rules,
      // 距今多少天没访问
      daysSinceAccess: r.last_accessed_at && r.last_accessed_at > 0
        ? Math.floor((now - r.last_accessed_at) / 86400)
        : null, // null = 从未访问
    }))

    return {
      thresholdDays: query.days,
      totalCold,
      shown: items.length,
      items,
    }
  }
  catch (err: any) {
    console.error('[cold-links] 查询失败:', err)
    throw createError({
      status: 500,
      message: '查询失败',
    })
  }
})