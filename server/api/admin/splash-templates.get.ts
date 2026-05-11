import { listSplashTemplates } from '@@/server/utils/splash-template'

/**
 * GET /api/admin/splash-templates
 *
 * 列出所有 Splash 模板(管理员可见全部,其他用户只能用)
 */
export default eventHandler(async (event) => {
  requireAdmin(event)

  const templates = await listSplashTemplates(event)
  return { templates }
})