import { LinkSchema } from '@@/schemas/link'

export default eventHandler(async (event) => {
  const link = await readValidatedBody(event, LinkSchema.parse)
  const { caseSensitive } = useRuntimeConfig(event)
  if (!caseSensitive) {
    link.slug = link.slug.toLowerCase()
  }

  // Day 2: 当前登录用户(由 server/middleware/2.auth.ts 注入)
  const currentUser = (event.context as any).user
  const ownerUsername = currentUser?.username

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // Check if link exists
  const existingLink = await KV.get(`link:${link.slug}`, { type: 'json' })
  if (existingLink) {
    // If link exists, return it along with the short link
    const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`
    return { link: existingLink, shortLink, status: 'existing' }
  }

  // ★ 安全:customHtml 仅 admin 可写(只在创建分支检查;已存在的链接走 existing 分支不写)
  const customHtml = (link as any).splashOverrides?.customHtml
  if (customHtml && typeof customHtml === 'string' && customHtml.trim() !== '' && currentUser?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Only admin can set customHtml',
    })
  }

  // Day 2: 创建分支才加 owner(已存在的不动)
  if (ownerUsername) {
    (link as any).owner = ownerUsername
  }

  // 密码处理:明文转哈希(只在创建分支)
  const plainPassword = (link as any).password
  if (plainPassword && typeof plainPassword === 'string') {
    try {
      (link as any).passwordHash = await hashPassword(plainPassword)
    }
    catch (err: any) {
      // ★ 安全:同 create,不能静默吞错
      console.error('[upsert] hashPassword 失败:', err?.message)
      throw createError({
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        message: 'Password hashing failed',
      })
    }
  }
  delete (link as any).password

  // If link doesn't exist, create it
  const expiration = getExpiration(event, link.expiration)

  // Step 1: 写 KV (source of truth)
  await KV.put(`link:${link.slug}`, JSON.stringify(link), {
    expiration,
    metadata: {
      expiration,
      url: link.url,
      comment: link.comment,
    },
  })

  // Step 2: 写 D1 镜像 (失败仅记 log)
  await upsertLinkToD1(event, link as any)

  setResponseStatus(event, 201)
  const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`
  return { link, shortLink, status: 'created' }
})
