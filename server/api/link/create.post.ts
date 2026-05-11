import { LinkSchema } from '@@/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Create a new short link',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['url'],
            properties: {
              url: {
                type: 'string',
                description: 'The URL to shorten',
              },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const link = await readValidatedBody(event, LinkSchema.parse)
  const { caseSensitive } = useRuntimeConfig(event)

  // Day 2: 写入当前登录用户为 owner
  const user = (event.context as any).user
  if (user?.username) {
    (link as any).owner = user.username
  }

  if (!caseSensitive) {
    link.slug = link.slug.toLowerCase()
  }

  // 密码处理:明文 password 转 passwordHash,然后删除明文
  const plainPassword = (link as any).password
  if (plainPassword && typeof plainPassword === 'string') {
    (link as any).passwordHash = await hashPassword(plainPassword)
  }
  delete (link as any).password

  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const existingLink = await KV.get(`link:${link.slug}`)
  if (existingLink) {
    throw createError({
      status: 409,
      statusText: 'Link already exists',
    })
  }

  const expiration = getExpiration(event, link.expiration)

  // Step 1: 写 KV (source of truth,失败则整个请求失败)
  await KV.put(`link:${link.slug}`, JSON.stringify(link), {
    expiration,
    metadata: {
      expiration,
      url: link.url,
      comment: link.comment,
    },
  })

  // Step 2: 写 D1 镜像 (失败仅记 log,不影响响应)
  await upsertLinkToD1(event, link as any)

  // Step 3: 写审计日志
  await writeAuditLog(event, {
    action: 'create',
    targetSlug: link.slug,
    targetUrl: link.url,
    newRules: (link as any).rules,
  })

  setResponseStatus(event, 201)
  const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`
  return { link, shortLink }
})