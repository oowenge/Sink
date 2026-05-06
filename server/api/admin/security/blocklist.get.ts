/**
 * GET /api/admin/security/blocklist
 * 列出所有黑名单条目(IP + CIDR)
 */
export default eventHandler(async (event) => {
  requireAdmin(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const [ipList, cidrList] = await Promise.all([
    KV.list({ prefix: 'blocklist:ip:' }),
    KV.list({ prefix: 'blocklist:cidr:' }),
  ])

  // 拉取详细记录
  const ipItems = await Promise.all((ipList.keys || []).map(async (key) => {
    const record = await KV.get(key.name, { type: 'json' }) as any
    return {
      type: 'ip' as const,
      value: key.name.replace('blocklist:ip:', ''),
      ...record,
    }
  }))

  const cidrItems = await Promise.all((cidrList.keys || []).map(async (key) => {
    const record = await KV.get(key.name, { type: 'json' }) as any
    return {
      type: 'cidr' as const,
      value: key.name.replace('blocklist:cidr:', ''),
      ...record,
    }
  }))

  const items = [...ipItems, ...cidrItems].sort((a, b) => (b.blockedAt || 0) - (a.blockedAt || 0))

  return { items, total: items.length }
})
