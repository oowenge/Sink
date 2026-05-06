import type { z } from 'zod'
import { LinkSchema } from '@@/schemas/link'

export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于权限检查
  const currentUser = requireAuth(event)

  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot edit links.',
    })
  }
  const link = await readValidatedBody(event, LinkSchema.parse)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env
  const existingLink: z.infer<typeof LinkSchema> | null = await KV.get(`link:${link.slug}`, { type: 'json' })
  if (existingLink) {
    // Day 4: 权限检查
    if (!canAccessLink(currentUser, existingLink)) {
      throw createError({
        status: 404,
        statusText: 'Not Found',
      })
    }

    // Day 2: 强制保留原 owner
    const existingOwner = (existingLink as any).owner

    const newLink = {
      ...existingLink,
      ...link,
      id: existingLink.id,
      createdAt: existingLink.createdAt,
      updatedAt: Math.floor(Date.now() / 1000),
    }

    if (existingOwner) {
      (newLink as any).owner = existingOwner
    }

    const expiration = getExpiration(event, newLink.expiration)

    // Step 1: 写 KV
    await KV.put(`link:${newLink.slug}`, JSON.stringify(newLink), {
      expiration,
      metadata: {
        expiration,
        url: newLink.url,
        comment: newLink.comment,
      },
    })

    // Step 2: 写 D1 镜像
    await upsertLinkToD1(event, newLink as any)

    // Step 3: 写审计日志(包含规则差异)
    await writeAuditLog(event, {
      action: 'edit',
      targetSlug: newLink.slug,
      targetUrl: newLink.url,
      oldUrl: existingLink.url !== newLink.url ? existingLink.url : undefined,
      oldRules: (existingLink as any).rules,
      newRules: (newLink as any).rules,
    })

    setResponseStatus(event, 201)
    const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${newLink.slug}`
    return { link: newLink, shortLink }
  }

  throw createError({
    status: 404,
    statusText: 'Not Found',
  })
})