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

    // ★ 安全:customHtml 仅 admin 可写(选项 3 方案)
    //   特殊处理:如果新值与原值相同,放行(允许 agent 编辑其他字段而不动 customHtml)
    const newCustomHtml = (link as any).splashOverrides?.customHtml
    const oldCustomHtml = (existingLink as any).splashOverrides?.customHtml
    const newHtmlNormalized = (typeof newCustomHtml === 'string' ? newCustomHtml.trim() : '')
    const oldHtmlNormalized = (typeof oldCustomHtml === 'string' ? oldCustomHtml.trim() : '')
    if (newHtmlNormalized !== oldHtmlNormalized && newHtmlNormalized !== '' && currentUser.role !== 'admin') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        message: 'Only admin can set customHtml',
      })
    }

    // Day 2: 强制保留原 owner
    const existingOwner = (existingLink as any).owner

    // 密码处理:
    //   - 传 password 明文且非空 -> 哈希并替换 passwordHash
    //   - 传 password = '' -> 清除密码
    //   - 不传 password 字段 -> 保留原 passwordHash
    const submittedPassword = (link as any).password
    let finalPasswordHash: string | undefined | null
    if (submittedPassword === '') {
      finalPasswordHash = null // 显式清除
    }
    else if (typeof submittedPassword === 'string' && submittedPassword.length > 0) {
      try {
        finalPasswordHash = await hashPassword(submittedPassword)
      }
      catch (err: any) {
        // ★ 安全:同 create,不能静默吞错
        console.error('[edit] hashPassword 失败:', err?.message)
        throw createError({
          statusCode: 500,
          statusMessage: 'Internal Server Error',
          message: 'Password hashing failed',
        })
      }
    }
    else {
      finalPasswordHash = (existingLink as any).passwordHash // 保留原值
    }
    // 永远不让前端的明文 password / passwordHash 直接污染 newLink
    delete (link as any).password
    delete (link as any).passwordHash

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
    // 设置最终密码哈希
    if (finalPasswordHash) {
      (newLink as any).passwordHash = finalPasswordHash
    }
    else {
      delete (newLink as any).passwordHash
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
