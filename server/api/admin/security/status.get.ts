/**
 * GET /api/admin/security/status
 * 安全总览:当前锁定数 / 黑名单数 / 白名单数
 */
export default eventHandler(async (event) => {
  requireAdmin(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 并行查 4 类 key 的总数
  const [lockedUsers, ipBlocks, cidrBlocks, ipAllows, cidrAllows] = await Promise.all([
    KV.list({ prefix: 'login_fail:user:' }),
    KV.list({ prefix: 'blocklist:ip:' }),
    KV.list({ prefix: 'blocklist:cidr:' }),
    KV.list({ prefix: 'allowlist:ip:' }),
    KV.list({ prefix: 'allowlist:cidr:' }),
  ])

  // 锁定数要排除"只是计数没锁"的记录
  const now = Math.floor(Date.now() / 1000)
  let actuallyLocked = 0
  for (const key of lockedUsers.keys || []) {
    const record = await KV.get(key.name, { type: 'json' }) as { lockedUntil?: number } | null
    if (record?.lockedUntil && record.lockedUntil > now) {
      actuallyLocked++
    }
  }

  return {
    lockedUsers: actuallyLocked,
    blocklist: {
      ips: ipBlocks.keys?.length || 0,
      cidrs: cidrBlocks.keys?.length || 0,
    },
    allowlist: {
      ips: ipAllows.keys?.length || 0,
      cidrs: cidrAllows.keys?.length || 0,
    },
  }
})