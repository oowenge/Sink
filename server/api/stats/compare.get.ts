import type { H3Event } from 'h3'
import { z } from 'zod'

const { select } = SqlBricks

const CompareQuerySchema = z.object({
  startAt: z.coerce.number().int().positive().optional(),
  endAt: z.coerce.number().int().positive().optional(),
  country: z.string().trim().toUpperCase().min(2).max(3).optional(),
  slugContains: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
})

type CompareQuery = z.infer<typeof CompareQuerySchema>

function query2sql(query: CompareQuery, event: H3Event): string {
  const { dataset } = useRuntimeConfig(event)

  // blob1=slug, blob2=url, blob4=ip, blob6=country, index1=slug
  const countryFilter = query.country ? `blob6 = '${query.country}'` : '1=1'

  const sql = select(
    `index1 as slug,
     any(blob2) as url,
     SUM(_sample_interval) as totalClicks,
     SUM(IF(${countryFilter}, _sample_interval, 0)) as countryClicks,
     COUNT(DISTINCT IF(${countryFilter}, blob4, NULL)) as countryUV`,
  )
    .from(dataset)
    .groupBy('index1')

  // slug 模糊匹配
  if (query.slugContains) {
    const safe = query.slugContains.replace(/[^\w-]/g, '')
    if (safe) {
      sql.where(SqlBricks(`index1 LIKE '%${safe}%'`))
    }
  }

  // 时间过滤
  appendTimeFilter(sql, query as any)

  // sql-bricks 不支持 .having() 和 .orderBy() 在 GROUP BY 之后的链式调用
  // 直接把 HAVING、ORDER BY、LIMIT 拼接到生成的 SQL 末尾
  const orderField = query.country ? 'countryClicks' : 'totalClicks'
  const havingField = query.country ? 'countryClicks' : 'totalClicks'

  return `${sql.toString()} HAVING ${havingField} > 0 ORDER BY ${orderField} DESC LIMIT ${query.limit}`
}

defineRouteMeta({
  openAPI: {
    description: 'Compare click counts of multiple links by country (BI-style ranking)',
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, CompareQuerySchema.parse)
  const sql = query2sql(query, event)

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
