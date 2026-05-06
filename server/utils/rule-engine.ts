/**
 * 跳转规则引擎
 *
 * 输入: 一条链接的 rules 数组 + 访问者的上下文(国家/时间)
 * 输出: 命中的 url + 命中的规则信息(用于日志记录)
 *
 * 规则类型:
 *   - country: 按访问者国家匹配
 *   - time:    按访问时间匹配(支持时区 + 多时间窗 + 星期)
 *   - ab:      按权重随机分流
 *
 * 规则匹配按数组顺序,第一条匹配即返回,都不匹配返回 null(由调用方走默认 url)。
 */

export interface CountryRule {
  id: string
  type: 'country'
  match: string[] // ISO 3166-1 alpha-2: ['BR', 'AR', ...]
  url: string
}

export interface TimeWindow {
  start: string // 'HH:MM' 24h
  end: string // 'HH:MM' 24h
  weekdays?: number[] // 0=周日, 1=周一, ..., 6=周六; 不填表示每天
}

export interface TimeRule {
  id: string
  type: 'time'
  tz: string // IANA 时区,如 'Asia/Kuala_Lumpur'
  windows: TimeWindow[]
  url: string
}

export interface AbVariant {
  url: string
  weight: number // 任意正数,引擎会自动归一化
}

export interface AbRule {
  id: string
  type: 'ab'
  variants: AbVariant[]
}

export type Rule = CountryRule | TimeRule | AbRule

export interface MatchContext {
  country?: string // 访问者国家(Cloudflare cf.country)
  now?: Date // 当前时间,默认 new Date()
}

export interface MatchResult {
  url: string
  ruleId: string
  ruleType: 'country' | 'time' | 'ab'
  variantIndex?: number // ab 类型才有
}

/**
 * 主入口:遍历规则数组,返回第一个命中的 url
 * 都不匹配返回 null
 */
export function matchRules(rules: Rule[] | undefined, ctx: MatchContext): MatchResult | null {
  if (!Array.isArray(rules) || rules.length === 0) return null

  const now = ctx.now || new Date()

  for (const rule of rules) {
    try {
      if (rule.type === 'country') {
        if (matchCountry(rule, ctx.country)) {
          return { url: rule.url, ruleId: rule.id, ruleType: 'country' }
        }
      }
      else if (rule.type === 'time') {
        if (matchTime(rule, now)) {
          return { url: rule.url, ruleId: rule.id, ruleType: 'time' }
        }
      }
      else if (rule.type === 'ab') {
        const picked = pickAbVariant(rule)
        if (picked) {
          return {
            url: picked.url,
            ruleId: rule.id,
            ruleType: 'ab',
            variantIndex: picked.index,
          }
        }
      }
    }
    catch (err) {
      // 单条规则出错不影响其他规则
      console.error('[rule-engine] rule error:', rule.id, err)
    }
  }

  return null
}

/**
 * 国家匹配
 */
function matchCountry(rule: CountryRule, country: string | undefined): boolean {
  if (!country) return false
  if (!Array.isArray(rule.match) || rule.match.length === 0) return false
  return rule.match.some(c => c.toUpperCase() === country.toUpperCase())
}

/**
 * 时间匹配
 *   - 把当前时间转换到目标时区
 *   - 检查是否在任何一个 window 内
 *   - 支持跨午夜(start > end 表示跨日,如 22:00 - 06:00)
 *   - 支持星期过滤
 */
function matchTime(rule: TimeRule, now: Date): boolean {
  if (!Array.isArray(rule.windows) || rule.windows.length === 0) return false
  if (!rule.tz) return false

  // 把 now 按 rule.tz 转换为本地时间
  const local = toTzLocal(now, rule.tz)
  if (!local) return false

  const minutesNow = local.hour * 60 + local.minute
  const weekday = local.weekday // 0=周日, 1=周一, ..., 6=周六

  for (const w of rule.windows) {
    // 星期过滤
    if (Array.isArray(w.weekdays) && w.weekdays.length > 0 && !w.weekdays.includes(weekday)) {
      continue
    }
    // 时间窗口
    const startMin = parseHm(w.start)
    const endMin = parseHm(w.end)
    if (startMin === null || endMin === null) continue

    if (startMin <= endMin) {
      // 同日窗口: 如 09:00 - 18:00
      if (minutesNow >= startMin && minutesNow < endMin) return true
    }
    else {
      // 跨午夜窗口: 如 22:00 - 06:00
      if (minutesNow >= startMin || minutesNow < endMin) return true
    }
  }
  return false
}

/**
 * 把 'HH:MM' 转成总分钟数,无效返回 null
 */
function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '')
  if (!m) return null
  const h = +m[1]
  const min = +m[2]
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * 把 Date 按时区转成本地小时/分钟/星期
 * 用 Intl.DateTimeFormat,无依赖
 */
function toTzLocal(date: Date, tz: string): { hour: number, minute: number, weekday: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    })
    const parts = fmt.formatToParts(date)
    let hour = 0, minute = 0, weekdayStr = ''
    for (const p of parts) {
      if (p.type === 'hour') hour = +p.value
      else if (p.type === 'minute') minute = +p.value
      else if (p.type === 'weekday') weekdayStr = p.value
    }
    // Intl 输出的 hour 在 24h 制下午夜是 '24',要转回 0
    if (hour === 24) hour = 0
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const weekday = weekdayMap[weekdayStr] ?? -1
    if (weekday < 0) return null
    return { hour, minute, weekday }
  }
  catch {
    return null
  }
}

/**
 * A/B 测试:按权重随机选一个 variant
 *   - weight <= 0 的 variant 被忽略
 *   - 全部权重为 0 返回 null
 *   - 否则按归一化权重抽样,返回 { url, index }
 */
function pickAbVariant(rule: AbRule): { url: string, index: number } | null {
  if (!Array.isArray(rule.variants) || rule.variants.length === 0) return null

  // 过滤无效权重并计算总和
  const valid: Array<{ url: string, weight: number, originalIndex: number }> = []
  let total = 0
  rule.variants.forEach((v, i) => {
    const w = Number(v.weight) || 0
    if (w > 0 && v.url) {
      valid.push({ url: v.url, weight: w, originalIndex: i })
      total += w
    }
  })

  if (total <= 0) return null

  // 在 [0, total) 区间随机取一个数,落到哪个 variant 区间就选谁
  const r = Math.random() * total
  let acc = 0
  for (const v of valid) {
    acc += v.weight
    if (r < acc) {
      return { url: v.url, index: v.originalIndex }
    }
  }
  // 浮点边界兜底
  const last = valid[valid.length - 1]
  return { url: last.url, index: last.originalIndex }
}

/**
 * 校验单条规则的格式是否合法(用于创建/编辑链接时)
 */
export function validateRule(rule: any): { valid: boolean, error?: string } {
  if (!rule || typeof rule !== 'object') return { valid: false, error: '规则必须是对象' }
  if (!rule.id || typeof rule.id !== 'string') return { valid: false, error: '规则缺少 id' }

  if (rule.type === 'country') {
    if (!Array.isArray(rule.match) || rule.match.length === 0) {
      return { valid: false, error: 'country 规则的 match 不能为空' }
    }
    if (!rule.url || typeof rule.url !== 'string') {
      return { valid: false, error: 'country 规则缺少 url' }
    }
    return { valid: true }
  }

  if (rule.type === 'time') {
    if (!rule.tz || typeof rule.tz !== 'string') return { valid: false, error: 'time 规则缺少 tz' }
    if (!Array.isArray(rule.windows) || rule.windows.length === 0) {
      return { valid: false, error: 'time 规则的 windows 不能为空' }
    }
    for (const w of rule.windows) {
      if (parseHm(w.start) === null) return { valid: false, error: `时间窗口 start 格式错误: ${w.start}` }
      if (parseHm(w.end) === null) return { valid: false, error: `时间窗口 end 格式错误: ${w.end}` }
    }
    if (!rule.url || typeof rule.url !== 'string') return { valid: false, error: 'time 规则缺少 url' }
    return { valid: true }
  }

  if (rule.type === 'ab') {
    if (!Array.isArray(rule.variants) || rule.variants.length < 2) {
      return { valid: false, error: 'ab 规则至少需要 2 个 variant' }
    }
    let totalWeight = 0
    for (const v of rule.variants) {
      const w = Number(v.weight) || 0
      if (w < 0) return { valid: false, error: 'variant weight 不能为负' }
      if (!v.url) return { valid: false, error: 'variant 缺少 url' }
      totalWeight += w
    }
    if (totalWeight <= 0) return { valid: false, error: 'ab 规则总权重必须 > 0' }
    return { valid: true }
  }

  return { valid: false, error: `未知规则类型: ${rule.type}` }
}

/**
 * 校验整个 rules 数组
 */
export function validateRules(rules: any): { valid: boolean, error?: string } {
  if (rules === undefined || rules === null) return { valid: true } // 允许空(老链接)
  if (!Array.isArray(rules)) return { valid: false, error: 'rules 必须是数组' }
  if (rules.length > 50) return { valid: false, error: 'rules 数量不能超过 50' }

  for (let i = 0; i < rules.length; i++) {
    const result = validateRule(rules[i])
    if (!result.valid) return { valid: false, error: `规则 #${i + 1}: ${result.error}` }
  }
  return { valid: true }
}