export default eventHandler(async (event) => {
  // Day 4: 拿当前用户用于权限检查
  const currentUser = requireAuth(event)

  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot delete links.',
    })
  }
  const { slug } = await readBody(event)
  if (slug) {
    const { cloudflare } = event.context
    const { KV } = cloudflare.env

    // Day 4: 先取出链接,检查权限
    const existing = await KV.get(`link:${slug}`, { type: 'json' })
    if (!existing) {
      throw createError({
        status: 404,
        statusText: 'Not Found',
      })
    }
    if (!canAccessLink(currentUser, existing)) {
      throw createError({
        status: 404,
        statusText: 'Not Found',
      })
    }

    // Step 1: 删 KV
    await KV.delete(`link:${slug}`)

    // Step 2: 删 D1 (失败仅记 log)
    await deleteLinkFromD1(event, slug)

    // Step 3: 写审计日志
    await writeAuditLog(event, {
      action: 'delete',
      targetSlug: slug,
      targetUrl: (existing as any).url,
      oldRules: (existing as any).rules,
    })
  }
})