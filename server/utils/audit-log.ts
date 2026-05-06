/**
 * 操作日志工具
 *
 * 记录到 D1 audit_logs 表。
 *
 * 设计原则:
 *   - 日志写失败不影响主流程(仅记 console)
 *   - 90 天后自动清理(由独立的清理任务负责)
 */
import type { H3Event } from 'h3'

export type AuditAction = 'create' | 'edit' | 'delete' | 'batch_create'

export interface AuditLogInput {
  action: AuditAction
  targetSlug?: string
  targetUrl?: string
  oldUrl?: string
  oldRules?: any[]
  newRules?: any[]
  details?: Record<string, any>
}

/**
 * 比较新旧规则,生成摘要
 *
 * 输出格式:
 *   {
 *     before: 2,            // 旧规则数量
 *     after: 3,              // 新规则数量
 *     added:   [{type:'country', match:['BR']}],
 *     removed: [{type:'time'}],
 *     modified: [{type:'ab', changed:['weights']}]
 *   }
 */
function diffRules(oldRules: any[] | undefined, newRules: any[] | undefined): any {
  const oldArr = Array.isArray(oldRules) ? oldRules : []
  const newArr = Array.isArray(newRules) ? newRules : []

  // 没规则也没变化,不记录
  if (oldArr.length === 0 && newArr.length === 0) return null

  const oldById = new Map<string, any>()
  oldArr.forEach(r => r?.id && oldById.set(r.id, r))
  const newById = new Map<string, any>()
  newArr.forEach(r => r?.id && newById.set(r.id, r))

  const added: any[] = []
  const removed: any[] = []
  const modified: any[] = []

  // 新增的规则(新有旧没有)
  for (const [id, r] of newById) {
    if (!oldById.has(id)) {
      added.push(summarizeRule(r))
    }
  }

  // 删除的规则(旧有新没有)
  for (const [id, r] of oldById) {
    if (!newById.has(id)) {
      removed.push(summarizeRule(r))
    }
  }

  // 修改的规则(两边都有但内容不同)
  for (const [id, oldR] of oldById) {
    const newR = newById.get(id)
    if (newR && JSON.stringify(oldR) !== JSON.stringify(newR)) {
      modified.push({
        ...summarizeRule(newR),
        _from: summarizeRule(oldR),
      })
    }
  }

  if (added.length === 0 && removed.length === 0 && modified.length === 0) return null

  return {
    before: oldArr.length,
    after: newArr.length,
    added: added.length > 0 ? added : undefined,
    removed: removed.length > 0 ? removed : undefined,
    modified: modified.length > 0 ? modified : undefined,
  }
}

/**
 * 把单条规则简化成摘要(避免日志过大)
 */
function summarizeRule(rule: any): any {
  if (!rule || typeof rule !== 'object') return rule
  if (rule.type === 'country') {
    return { type: 'country', match: rule.match, url: rule.url }
  }
  if (rule.type === 'time') {
    return {
      type: 'time',
      tz: rule.tz,
      windows: rule.windows?.map((w: any) => `${w.start}-${w.end}${w.weekdays ? `(${w.weekdays.join(',')})` : ''}`),
      url: rule.url,
    }
  }
  if (rule.type === 'ab') {
    return {
      type: 'ab',
      variants: rule.variants?.map((v: any) => `${v.url}@${v.weight}`),
    }
  }
  return rule
}

/**
 * 写一条审计日志到 D1
 * 写失败仅 console.error,不抛错(不影响主流程)
 */
export async function writeAuditLog(event: H3Event, input: AuditLogInput): Promise<void> {
  try {
    const DB = (event.context as any)?.cloudflare?.env?.DB
    if (!DB) {
      console.warn('[audit] DB binding 不存在,跳过日志')
      return
    }

    const user = (event.context as any).user
    const actor = user?.username || 'unknown'
    const actorIp = getClientIp(event) || ''
    const ts = Math.floor(Date.now() / 1000)
    const id = `log_${ts}_${Math.random().toString(36).slice(2, 8)}`

    // 规则摘要
    const rulesSummary = diffRules(input.oldRules, input.newRules)

    const sql = `
      INSERT INTO audit_logs
      (id, timestamp, actor, actor_ip, action, target_slug, target_url, old_url, rules_summary, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    await DB.prepare(sql).bind(
      id,
      ts,
      actor,
      actorIp,
      input.action,
      input.targetSlug || null,
      input.targetUrl || null,
      input.oldUrl || null,
      rulesSummary ? JSON.stringify(rulesSummary) : null,
      input.details ? JSON.stringify(input.details) : null,
    ).run()
  }
  catch (err: any) {
    console.error('[audit] 写日志失败:', err?.message)
  }
}

/**
 * 批量创建时,把多条 link 浓缩成一条日志
 */
export async function writeBatchAuditLog(
  event: H3Event,
  links: Array<{ slug: string, url: string }>,
  failed: number,
): Promise<void> {
  try {
    if (links.length === 0 && failed === 0) return

    await writeAuditLog(event, {
      action: 'batch_create',
      details: {
        total: links.length + failed,
        success: links.length,
        failed,
        // 只记前 20 条 slug,避免日志过大
        sampleSlugs: links.slice(0, 20).map(l => l.slug),
      },
    })
  }
  catch (err: any) {
    console.error('[audit] 写批量日志失败:', err?.message)
  }
}