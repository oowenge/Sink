/**
 * GET /api/admin/audit-logs
 *
 * Query params:
 *   - actor: 按操作者过滤
 *   - action: 按动作过滤(create/edit/delete/batch_create)
 *   - slug: 按目标 slug 过滤
 *   - q: 全文搜索(slug + url)
 *   - startAt: unix 秒
 *   - endAt: unix 秒
 *   - limit: 默认 50,最大 200
 *   - cursor: 上一页最后一条的 timestamp_id
 */
import { z } from 'zod'

const QuerySchema = z.object({
  actor: z.string().trim().max(50).optional(),
  action: z.enum(['create', 'edit', 'delete', 'batch_create']).optional(),
  slug: z.string().trim().max(2048).optional(),
  q: z.string().trim().max(200).optional(),
  startAt: z.coerce.number().int().optional(),
  endAt: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().max(100).optional(),
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

  // 解析 cursor
  let cursorTs: number | null = null
  let cursorId: string | null = null
  if (query.cursor) {
    const [t, i] = query.cursor.split('|')
    cursorTs = +t || null
    cursorId = i || null
  }

  const conditions: string[] = []
  const params: any[] = []

  if (query.actor) {
    conditions.push('actor = ?')
    params.push(query.actor)
  }
  if (query.action) {
    conditions.push('action = ?')
    params.push(query.action)
  }
  if (query.slug) {
    conditions.push('target_slug = ?')
    params.push(query.slug)
  }
  if (query.q) {
    conditions.push('(target_slug LIKE ? OR target_url LIKE ?)')
    const wild = `%${query.q}%`
    params.push(wild, wild)
  }
  if (query.startAt) {
    conditions.push('timestamp >= ?')
    params.push(query.startAt)
  }
  if (query.endAt) {
    conditions.push('timestamp <= ?')
    params.push(query.endAt)
  }
  if (cursorTs !== null && cursorId !== null) {
    conditions.push('(timestamp < ? OR (timestamp = ? AND id < ?))')
    params.push(cursorTs, cursorTs, cursorId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `
    SELECT * FROM audit_logs
    ${whereClause}
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `
  params.push(query.limit + 1)

  try {
    const result = await DB.prepare(sql).bind(...params).all()
    const rows = result?.results || []

    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, query.limit) : rows

    // 解析 JSON 字段
    const parsed = items.map((r: any) => ({
      id: r.id,
      timestamp: r.timestamp,
      actor: r.actor,
      actorIp: r.actor_ip,
      action: r.action,
      targetSlug: r.target_slug,
      targetUrl: r.target_url,
      oldUrl: r.old_url,
      rulesSummary: r.rules_summary ? JSON.parse(r.rules_summary) : null,
      details: r.details ? JSON.parse(r.details) : null,
    }))

    let nextCursor: string | undefined
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]
      nextCursor = `${last.timestamp}|${last.id}`
    }

    return {
      items: parsed,
      hasMore,
      cursor: nextCursor,
    }
  }
  catch (err: any) {
    console.error('[audit-logs] 查询失败:', err)
    throw createError({
      status: 500,
      message: '日志查询失败',
    })
  }
})