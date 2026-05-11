import { SplashTemplateSchema } from '@@/schemas/splash-template'
import { createSplashTemplate } from '@@/server/utils/splash-template'

/**
 * POST /api/admin/splash-templates
 *
 * 创建 Splash 模板(admin only)
 */
export default eventHandler(async (event) => {
  const user = requireAdmin(event)

  const body = await readBody(event)
  const parsed = SplashTemplateSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: parsed.error.message,
    })
  }

  const created = await createSplashTemplate(event, parsed.data, user.username)
  return created
})