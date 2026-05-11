import { deleteSplashTemplate, getSplashTemplate } from '@@/server/utils/splash-template'

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

  await deleteSplashTemplate(event, id)
  return { ok: true }
})