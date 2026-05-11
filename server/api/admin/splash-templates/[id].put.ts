import { SplashTemplateSchema } from '@@/schemas/splash-template'
import { getSplashTemplate, updateSplashTemplate } from '@@/server/utils/splash-template'

export default eventHandler(async (event) => {
  requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, message: 'missing id' })
  }

  const exists = await getSplashTemplate(event, id)
  if (!exists) {
    throw createError({ status: 404, message: 'template not found' })
  }

  const body = await readBody(event)
  const parsed = SplashTemplateSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ status: 400, message: parsed.error.message })
  }

  await updateSplashTemplate(event, id, parsed.data)
  return { ok: true, id }
})