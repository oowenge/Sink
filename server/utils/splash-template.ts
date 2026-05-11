/**
 * Splash 模板 D1 工具
 */
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12)

function getDB(event: any) {
  return (event.context as any)?.cloudflare?.env?.DB
}

/**
 * D1 row -> SplashTemplate
 */
function rowToTemplate(row: any) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    buttonText: row.button_text,
    buttonColor: row.button_color,
    bgColor: row.bg_color,
    textColor: row.text_color,
    countdownSeconds: row.countdown_seconds ?? 5,
    pixelFacebook: row.pixel_facebook,
    pixelGoogleAds: row.pixel_google_ads,
    pixelTiktok: row.pixel_tiktok,
    pixelTwitter: row.pixel_twitter,
    customHtml: row.custom_html,
    owner: row.owner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 取一个模板(按 id)
 */
export async function getSplashTemplate(event: any, id: string): Promise<any | null> {
  const DB = getDB(event)
  if (!DB) return null
  try {
    const row = await DB.prepare('SELECT * FROM splash_templates WHERE id = ?').bind(id).first()
    if (!row) return null
    return rowToTemplate(row)
  }
  catch (err: any) {
    console.error('[splash-template] get 失败:', id, err?.message)
    return null
  }
}

/**
 * 列表(全部 admin 都能看,因为模板是全局共享的)
 */
export async function listSplashTemplates(event: any): Promise<any[]> {
  const DB = getDB(event)
  if (!DB) return []
  try {
    const result = await DB.prepare(
      'SELECT * FROM splash_templates ORDER BY created_at DESC LIMIT 200',
    ).all()
    return (result?.results || []).map(rowToTemplate)
  }
  catch (err: any) {
    console.error('[splash-template] list 失败:', err?.message)
    return []
  }
}

/**
 * 创建模板
 */
export async function createSplashTemplate(event: any, data: any, ownerUsername: string): Promise<any> {
  const DB = getDB(event)
  if (!DB) throw new Error('DB binding 不存在')

  const now = Math.floor(Date.now() / 1000)
  const id = `splash_${nanoid()}`

  await DB.prepare(`
    INSERT INTO splash_templates
    (id, name, title, subtitle, image_url, button_text, button_color, bg_color, text_color, countdown_seconds,
     pixel_facebook, pixel_google_ads, pixel_tiktok, pixel_twitter, custom_html,
     owner, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.name,
    data.title ?? null,
    data.subtitle ?? null,
    data.imageUrl ?? null,
    data.buttonText ?? null,
    data.buttonColor ?? null,
    data.bgColor ?? null,
    data.textColor ?? null,
    data.countdownSeconds ?? 5,
    data.pixelFacebook ?? null,
    data.pixelGoogleAds ?? null,
    data.pixelTiktok ?? null,
    data.pixelTwitter ?? null,
    data.customHtml ?? null,
    ownerUsername,
    now,
    now,
  ).run()

  return { id, ...data, owner: ownerUsername, createdAt: now, updatedAt: now }
}

/**
 * 更新模板
 */
export async function updateSplashTemplate(event: any, id: string, data: any): Promise<void> {
  const DB = getDB(event)
  if (!DB) throw new Error('DB binding 不存在')

  const now = Math.floor(Date.now() / 1000)

  await DB.prepare(`
    UPDATE splash_templates SET
      name = ?, title = ?, subtitle = ?, image_url = ?, button_text = ?,
      button_color = ?, bg_color = ?, text_color = ?, countdown_seconds = ?,
      pixel_facebook = ?, pixel_google_ads = ?, pixel_tiktok = ?, pixel_twitter = ?,
      custom_html = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    data.name,
    data.title ?? null,
    data.subtitle ?? null,
    data.imageUrl ?? null,
    data.buttonText ?? null,
    data.buttonColor ?? null,
    data.bgColor ?? null,
    data.textColor ?? null,
    data.countdownSeconds ?? 5,
    data.pixelFacebook ?? null,
    data.pixelGoogleAds ?? null,
    data.pixelTiktok ?? null,
    data.pixelTwitter ?? null,
    data.customHtml ?? null,
    now,
    id,
  ).run()
}

/**
 * 删除模板
 */
export async function deleteSplashTemplate(event: any, id: string): Promise<void> {
  const DB = getDB(event)
  if (!DB) throw new Error('DB binding 不存在')
  await DB.prepare('DELETE FROM splash_templates WHERE id = ?').bind(id).run()
}

/**
 * 合并模板 + 链接覆盖 -> 最终的 Splash 配置
 */
export function mergeSplashConfig(template: any, overrides: any | undefined): any {
  if (!template) return null
  const merged = { ...template }
  if (overrides && typeof overrides === 'object') {
    for (const key of Object.keys(overrides)) {
      const v = overrides[key]
      if (v !== undefined && v !== null && v !== '') {
        merged[key] = v
      }
    }
  }
  return merged
}