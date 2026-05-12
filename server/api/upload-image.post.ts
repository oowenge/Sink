/**
 * POST /api/upload-image
 *
 * 接收前端 multipart/form-data 图片上传
 * 转发到 ImgBB API
 * 返回图片 URL
 *
 * 限制:
 *   - 单张 5 MB(预检 Content-Length + 后检 byteLength 双重)
 *   - 格式: JPG / PNG / WebP / GIF (declared MIME + magic bytes 双重校验)
 *   - 必须登录
 *   - 速率限制: 5/分钟,30/小时,100/天 (per user)
 *
 * 安全设计:
 *   - 不回传 ImgBB delete_url (永久 secret URL,泄露=任何人可删图)
 *   - 不透传用户 filename 到 ImgBB (避免任意字符串注入第三方)
 *   - 错误消息不包含内部细节
 */

import { Buffer } from 'node:buffer'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * 通过 magic bytes 判断真实图片类型
 * 返回 null 表示不是支持的图片格式
 */
function detectImageMime(buf: Uint8Array): string | null {
  if (buf.length < 12)
    return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)
    return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)
    return 'image/png'
  // GIF: 47 49 46 38 (37|39) 61
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return 'image/gif'
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

export default eventHandler(async (event) => {
  const user = requireAuth(event)

  // 预检 Content-Length,避免读完整个 body 才发现超大
  // 留 10% 余量给 multipart 包裹(boundary、headers)
  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (contentLength > MAX_FILE_SIZE * 1.1) {
    throw createError({
      status: 413,
      statusText: 'Payload Too Large',
      message: '文件过大,最大 5 MB',
    })
  }

  // 速率限制:5/分,30/时,100/天
  // 同时给 admin 和普通用户:admin 账号被盗的后果比普通用户严重
  const rl = await checkApiRateLimit(event, 'upload', user.username, {
    perMinute: 5,
    perHour: 30,
    perDay: 100,
  })
  if (!rl.allowed) {
    throw createError({
      status: 429,
      statusText: 'Too Many Requests',
      message: `上传过于频繁,请稍后重试`,
    })
  }

  const apiKey = (event.context as any)?.cloudflare?.env?.IMGBB_API_KEY
  if (!apiKey) {
    throw createError({
      status: 503,
      statusText: 'Service Unavailable',
      message: '图片上传服务未配置',
    })
  }

  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({ status: 400, message: '未收到文件' })
  }

  const imageField = form.find(f => f.name === 'image')
  if (!imageField || !imageField.data) {
    throw createError({ status: 400, message: '请通过 image 字段上传图片' })
  }

  // 大小后置校验(防 Content-Length 撒谎)
  if (imageField.data.byteLength > MAX_FILE_SIZE) {
    throw createError({ status: 413, message: '文件过大,最大 5 MB' })
  }

  // Declared MIME 白名单
  const declaredMime = imageField.type || ''
  if (!ALLOWED_TYPES.includes(declaredMime)) {
    throw createError({
      status: 400,
      message: '不支持的文件类型,支持: JPG / PNG / WebP / GIF',
    })
  }

  // Magic bytes 校验:真实类型必须与 declared 一致
  // 防止改 Content-Type 上传任意文件(.html/.svg/.exe 等)
  const detectedMime = detectImageMime(imageField.data)
  if (!detectedMime || detectedMime !== declaredMime) {
    throw createError({
      status: 400,
      message: '文件内容与声明类型不符',
    })
  }

  // 用 Buffer 做 base64 (Workers 启用了 nodejs_compat)
  // 旧版 Array.from + map + join 对 5MB 文件会爆 call stack
  const base64 = Buffer.from(imageField.data).toString('base64')

  try {
    const body = new FormData()
    body.append('image', base64)
    // 不透传 filename - ImgBB 会自动生成名字,我们不需要保留用户输入

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body,
    })

    if (!res.ok) {
      // 不把响应体回传给客户端
      console.error('[upload-image] ImgBB HTTP', res.status)
      throw createError({
        status: 502,
        statusText: 'Bad Gateway',
        message: '图床服务异常,请稍后重试',
      })
    }

    const json = await res.json() as any
    if (!json.success || !json.data?.url) {
      console.error('[upload-image] ImgBB 响应异常:', json)
      throw createError({ status: 502, message: '上传失败' })
    }

    return {
      url: json.data.url,
      displayUrl: json.data.display_url,
      thumbUrl: json.data.thumb?.url,
      width: json.data.width,
      height: json.data.height,
      size: json.data.size,
      // 不回传 deleteUrl - 这是永久 secret URL,泄露即可被任何人删图
      // 未来若需要"删除已上传图"功能,应存到 D1 并通过鉴权端点访问
    }
  }
  catch (err: any) {
    if (err?.statusCode)
      throw err // 已经是 createError,保留
    // 不把 err.message 拼到响应里(可能泄露内部栈/键名)
    console.error('[upload-image] 上传异常:', err?.message, err?.stack)
    throw createError({ status: 500, message: '上传失败' })
  }
})
