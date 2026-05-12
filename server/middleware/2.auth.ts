/**
 * 双轨鉴权中间件
 *
 * - 路径以 /api/ 开头(且不是 /api/_ 内部路径)的请求需要鉴权
 * - 公开放行的接口:/api/auth/login(登录本身不需要 token)
 * - 鉴权策略(按优先级):
 *   0. IP 黑名单拦截(白名单 IP 跳过此检查)
 *   1. 看 Bearer token 是不是 KV 里的 user session
 *   2. 不是 → 401
 *
 * 鉴权通过后,会在 event.context.user 里挂一个 { username, role } 对象,
 * 后续 API 可以读这个判断当前用户身份。
 */
const PUBLIC_API_PATHS = [
  '/api/auth/login',
]

export default eventHandler(async (event) => {
  // 非 /api/ 路径(包括短链跳转、前端页面等)直接放行
  if (!event.path.startsWith('/api/'))
    return
  // /api/_ 开头的内部路径(Nuxt 内部用)放行
  if (event.path.startsWith('/api/_'))
    return

  // IP 黑名单拦截(对所有 /api/ 请求生效,包括 /api/auth/login)
  // 白名单 IP 跳过此检查
  const ip = getClientIp(event)
  if (ip) {
    const allowlisted = await isIpAllowlisted(event, ip)
    if (!allowlisted) {
      const blockStatus = await isIpBlocklisted(event, ip)
      if (blockStatus.blocked) {
        throw createError({
          status: 403,
          statusText: 'Forbidden',
          message: `您的 IP (${ip}) 已被封禁,请联系管理员`,
        })
      }
    }
  }

  // 公开 API 放行(已通过黑名单检查)
  for (const pubPath of PUBLIC_API_PATHS) {
    if (event.path === pubPath || event.path.startsWith(`${pubPath}?`)) {
      return
    }
  }

  const token = extractBearerToken(event)
  if (!token) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: '请先登录',
    })
  }

  if (token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }

  // 新轨:看是不是 user session
  const session = await getUserSession(event, token)
  if (session) {
    event.context.user = {
      username: session.username,
      role: session.role,
    }
    return
  }

  // 都不是 → 401
  throw createError({
    status: 401,
    statusText: 'Unauthorized',
    message: 'token 无效或已过期',
  })
})
