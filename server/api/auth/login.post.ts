import { z } from 'zod'

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
})

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, LoginSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const ip = getClientIp(event)
  const isAllowlisted = await isIpAllowlisted(event, ip)

  // 1. 黑名单拦截(白名单 IP 跳过)
  if (!isAllowlisted) {
    const blockStatus = await isIpBlocklisted(event, ip)
    if (blockStatus.blocked) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: `[IP_BLOCKED] 您的 IP (${ip}) 已被封禁,请联系管理员`,
      })
    }
  }

  // 2. 检查 username 是否被锁(白名单 IP 也要查,防止有效 username 被恶意尝试)
  const lockStatus = await getUserLockStatus(event, body.username)
  if (lockStatus.locked) {
    const minutes = Math.ceil(lockStatus.remainingSeconds / 60)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `[LOCKED:${lockStatus.remainingSeconds}] 账号已锁定,请 ${minutes} 分钟后再试`,
    })
  }

  // 查 user:{username}
  const user = await KV.get(`user:${body.username}`, { type: 'json' }) as {
    username: string
    passwordHash: string
    role: 'admin' | 'user'
    disabled?: boolean
  } | null

  if (!user) {
    // 故意不区分"用户不存在"和"密码错误"——避免被枚举用户名
    if (!isAllowlisted) {
      const failResult = await recordLoginFailure(event, body.username, ip)
      if (failResult.userLocked) {
        throw createError({
          statusCode: 429,
          statusMessage: 'Too Many Requests',
          message: `[LOCKED:300] 连续失败 ${failResult.userFailCount} 次,账号已锁定 5 分钟`,
        })
      }
      if (failResult.ipBlocked) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Forbidden',
          message: `[IP_BLOCKED] IP 失败次数过多,已被永久封禁`,
        })
      }
      const remaining = Math.max(0, 3 - failResult.userFailCount)
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: `[REMAINING:${remaining}] 用户名或密码错误,还可尝试 ${remaining} 次`,
      })
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '用户名或密码错误',
    })
  }

  if (user.disabled) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: '账号已停用,请联系管理员',
    })
  }

  const passwordOk = await verifyPassword(body.password, user.passwordHash)
  if (!passwordOk) {
    // 白名单 IP 不计入失败统计
    if (!isAllowlisted) {
      const failResult = await recordLoginFailure(event, body.username, ip)

      // 失败导致用户被锁
      if (failResult.userLocked) {
        throw createError({
          statusCode: 429,
          statusMessage: 'Too Many Requests',
          message: `[LOCKED:300] 连续失败 ${failResult.userFailCount} 次,账号已锁定 5 分钟`,
        })
      }

      // 失败导致 IP 被封
      if (failResult.ipBlocked) {
        throw createError({
          statusCode: 403,
          statusMessage: 'Forbidden',
          message: `[IP_BLOCKED] IP 失败次数过多,已被永久封禁`,
        })
      }

      // 普通失败
      const remaining = Math.max(0, 3 - failResult.userFailCount)
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: `[REMAINING:${remaining}] 用户名或密码错误,还可尝试 ${remaining} 次`,
      })
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '用户名或密码错误',
    })
  }

  // 登录成功,清除该 username 的失败计数
  await clearUserFailCount(event, body.username)

  // 创建 session
  const token = await createUserSession(event, user.username, user.role)

  // 更新最后登录时间(可选,失败不影响登录)
  try {
    await KV.put(
      `user:${user.username}`,
      JSON.stringify({ ...user, lastLoginAt: Math.floor(Date.now() / 1000) }),
    )
  }
  catch {
    // 忽略
  }

  return {
    token,
    username: user.username,
    role: user.role,
  }
})
