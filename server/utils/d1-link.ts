/**
 * D1 链接读写工具
 *
 * 设计原则:
 *   - KV 是 source of truth (跳转 hot path)
 *   - D1 是镜像(用于 dashboard 复杂查询)
 *   - 写 D1 失败不影响主流程,仅记 log
 *
 * 表结构:
 *   links(id, slug, url, comment, owner, created_at, updated_at,
 *         expiration, title, description, image, rules)
 *
 * 注意:
 *   - rules 在 SQLite 里存 JSON 字符串
 *   - 读出来时要 JSON.parse
 */
import type { H3Event } from 'h3'

interface LinkRecord {
  id?: string
  slug: string
  url: string
  comment?: string
  owner?: string
  createdAt?: number
  updatedAt?: number
  expiration?: number
  title?: string
  description?: string
  image?: string
  rules?: any[]
  redirectStatus?: number
  tags?: string[]
  [key: string]: any
}

/**
 * 从 event 取 D1 binding
 * 如果未绑定(本地 dev / 未部署),返回 null,调用方应跳过 D1 操作
 */
function getDB(event: H3Event): any {
  return (event.context as any)?.cloudflare?.env?.DB || null
}

/**
 * 把 link 对象插入或更新 D1
 * 失败仅记 log,不抛错(避免影响主流程)
 */
export async function upsertLinkToD1(event: H3Event, link: LinkRecord): Promise<void> {
  const DB = getDB(event)
  if (!DB) {
    console.warn('[d1-link] DB binding not available, skip D1 upsert')
    return
  }

  try {
    const sql = `
      INSERT OR REPLACE INTO links
      (id, slug, url, comment, owner, created_at, updated_at, expiration, title, description, image, rules, redirect_status, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    await DB.prepare(sql).bind(
      link.id || link.slug,
      link.slug,
      link.url,
      link.comment ?? null,
      link.owner ?? null,
      link.createdAt ?? Math.floor(Date.now() / 1000),
      link.updatedAt ?? Math.floor(Date.now() / 1000),
      link.expiration ?? null,
      link.title ?? null,
      link.description ?? null,
      link.image ?? null,
      Array.isArray(link.rules) && link.rules.length > 0 ? JSON.stringify(link.rules) : null,
      link.redirectStatus ?? null,
      Array.isArray(link.tags) && link.tags.length > 0 ? JSON.stringify(link.tags) : null,
    ).run()
  }
  catch (err: any) {
    console.error('[d1-link] upsert 失败:', link.slug, err?.message)
  }
}

/**
 * 从 D1 删除某个 slug
 * 失败仅记 log
 */
export async function deleteLinkFromD1(event: H3Event, slug: string): Promise<void> {
  const DB = getDB(event)
  if (!DB) {
    console.warn('[d1-link] DB binding not available, skip D1 delete')
    return
  }

  try {
    await DB.prepare('DELETE FROM links WHERE slug = ?').bind(slug).run()
  }
  catch (err: any) {
    console.error('[d1-link] delete 失败:', slug, err?.message)
  }
}

/**
 * 把 D1 一行记录转回 link 对象格式
 * (rules 字段从 JSON 字符串解析回数组)
 */
export function d1RowToLink(row: any): LinkRecord {
  if (!row) return row
  const link: LinkRecord = {
    id: row.id,
    slug: row.slug,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.comment != null) link.comment = row.comment
  if (row.owner != null) link.owner = row.owner
  if (row.expiration != null) link.expiration = row.expiration
  if (row.title != null) link.title = row.title
  if (row.description != null) link.description = row.description
  if (row.image != null) link.image = row.image
  if (row.rules) {
    try {
      link.rules = JSON.parse(row.rules)
    }
    catch {
      link.rules = []
    }
  }
  if (row.redirect_status != null) link.redirectStatus = row.redirect_status
  if (row.tags) {
    try {
      link.tags = JSON.parse(row.tags)
    }
    catch {
      link.tags = []
    }
  }
  return link
}
/**
 * 仅更新 last_accessed_at 字段(用于跳转跟踪)
 * 不影响 link 其他数据
 */
export async function updateLastAccessedAt(event: any, slug: string, ts: number): Promise<void> {
  const DB = getDB(event)
  if (!DB) return

  try {
    await DB.prepare('UPDATE links SET last_accessed_at = ? WHERE slug = ?')
      .bind(ts, slug)
      .run()
  }
  catch (err: any) {
    console.error('[d1-link] update last_accessed_at 失败:', slug, err?.message)
  }
}