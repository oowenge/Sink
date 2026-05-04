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

  const conditions: string[] = []
  if (query.startAt) conditions.push(`timestamp >= toDateTime(${query.startAt})`)
  if (query.endAt) conditions.push(`timestamp <= toDateTime(${query.endAt})`)
  if (query.country) {
    const c = query.country.replace(/[^A-Z]/g, '')
    if (c) conditions.push(`blob6 = '${c}'`)
  }
  if (query.slugContains) {
    const s = query.slugContains.replace(/[^a-zA-Z0-9_-]/g, '')
    if (s) conditions.push(`blob1 LIKE '%${s}%'`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `SELECT blob1 as slug, SUM(_sample_interval) as countryClicks FROM ${dataset} ${where} GROUP BY blob1 ORDER BY countryClicks DESC LIMIT ${query.limit}`

  return sql
}

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, CompareQuerySchema.parse)
  const sql = buildSQL(query, event)
  console.log('compare SQL:', sql)

  const result = await useWAE(event, sql) as any

  const rows = (result?.data || []).map((r: any) => ({
    slug: r.slug,
    url: '',
    countryClicks: Number(r.countryClicks) || 0,
    countryUV: 0,
    totalClicks: Number(r.countryClicks) || 0,
    ratio: 1,
  }))

  return {
    country: query.country || null,
    timeRange: { startAt: query.startAt, endAt: query.endAt },
    total: rows.length,
    data: rows,
  }
})