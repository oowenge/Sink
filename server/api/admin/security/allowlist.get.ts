/**
 * GET /api/admin/security/allowlist
 * 列出所有白名单条目(IP + CIDR)
 */
export default eventHandler(async (event) => {
  requireAdmin(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const [ipList, cidrList] = await Promise.all([
    KV.list({ prefix: 'allowlist:ip:' }),
    KV.list({ prefix: 'allowlist:cidr:' }),
  ])

  const ipItems = await Promise.all((ipList.keys || []).map(async (key) => {
    const record = await KV.get(key.name, { type: 'json' }) as any
    return {
      type: 'ip' as const,
      value: key.name.replace('allowlist:ip:', ''),
      ...record,
    }
  }))

  const cidrItems = await Promise.all((cidrList.keys || []).map(async (key) => {
    const record = await KV.get(key.name, { type: 'json' }) as any
    return {
      type: 'cidr' as const,
      value: key.name.replace('allowlist:cidr:', ''),
      ...record,
    }
  }))

  const items = [...ipItems, ...cidrItems].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))

  return { items, total: items.length }
})