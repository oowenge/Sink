import type { H3Event } from 'h3'
import { z } from 'zod'

const CompareQuerySchema = z.object({
  startAt: z.coerce.number().int().positive().optional(),
  endAt: z.coerce.number().int().positive().optional(),
  country: z.string().trim().toUpperCase().max(3).optional().or(z.literal('')),
  slugContains: z.string().trim().max(100).optional().or(z.literal('')),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

type CompareQuery = z.infer<typeof CompareQuerySchema>

function buildSQL(query: CompareQuery, event: H3Event): string {
  const { dataset } = useRuntimeConfig(event)

  // blob1=slug, blob2=url, blob4=ip, blob6=country
  const conditions: string[] = []

  // 时间过滤
  if (query.startAt) {
    conditions.push(`timestamp >= toDateTime(${query.startAt})`)
  }
  if (query.endAt) {
    conditions.push(`timestamp <= toDateTime(${query.endAt})`)
  }

  // slug 模糊匹配(防注入:只允许 slug 合法字符)
  if (query.slugContains) {
    const safe = query.slugContains.replace(/[^a-zA-Z0-9_-]/g, '')
    if (safe) {
      conditions.push(`blob1 LIKE '%${safe}%'`)
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // 国家过滤的条件聚合
  let countrySafe = ''
  if (query.country) {
    countrySafe = query.country.replace(/[^A-Z]/g, '')  // 防注入
  }
  const countryFilter = countrySafe ? `blob6 = '${countrySafe}'` : '1=1'

  const orderField = countrySafe ? 'countryClicks' : 'totalClicks'
  const havingField = countrySafe ? 'countryClicks' : 'totalClicks'

  // 直接拼完整 SQL
  const sql = `
    SELECT
      blob1 as slug,
      any(blob2) as url,
      SUM(_sample_interval) as totalClicks,
      SUM(IF(${countryFilter}, _sample_interval, 0)) as countryClicks,
      COUNT(DISTINCT IF(${countryFilter}, blob4, NULL)) as countryUV
    FROM ${dataset}
    ${whereClause}
    GROUP BY blob1
    HAVING ${havingField} > 0
    ORDER BY ${orderField} DESC
    LIMIT ${query.limit}
  `.trim().replace(/\s+/g, ' ')

  return sql
}

defineRouteMeta({
  openAPI: {
    description: 'Compare click counts of multiple links by country (BI-style ranking)',
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, CompareQuerySchema.parse)
  const sql = buildSQL(query, event)

  console.log('compare SQL:', sql)  // 临时加日志方便调试

  const result = await useWAE(event, sql) as any

  const rows = (result?.data || []).map((r: any) => ({
    slug: r.slug,
    url: r.url,
    totalClicks: Number(r.totalClicks) || 0,
    countryClicks: Number(r.countryClicks) || 0,
    countryUV: Number(r.countryUV) || 0,
    ratio: r.totalClicks > 0 ? Number(r.countryClicks) / Number(r.totalClicks) : 0,
  }))

  return {
    country: query.country || null,
    timeRange: { startAt: query.startAt, endAt: query.endAt },
    total: rows.length,
    data: rows,
  }
})