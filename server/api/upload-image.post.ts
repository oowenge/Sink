/**
 * POST /api/upload-image
 *
 * 接收前端 multipart/form-data 图片上传
 * 转发到 ImgBB API
 * 返回图片 URL
 *
 * 限制:
 *   - 单张 5 MB
 *   - 格式: JPG / PNG / WebP / GIF
 *   - 必须登录
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default eventHandler(async (event) => {
  requireAuth(event)

  const apiKey = (event.context as any)?.cloudflare?.env?.IMGBB_API_KEY
  if (!apiKey) {
    throw createError({
      status: 503,
      statusText: 'Service Unavailable',
      message: '图片上传服务未配置',
    })
  }

  // 读取 multipart form data
  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '未收到文件',
    })
  }

  // 找到 image 字段
  const imageField = form.find(f => f.name === 'image')
  if (!imageField || !imageField.data) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: '请通过 image 字段上传图片',
    })
  }

  // 类型校验
  const mimeType = imageField.type || ''
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: `不支持的文件类型: ${mimeType}。支持: JPG / PNG / WebP / GIF`,
    })
  }

  // 大小校验
  const fileSize = imageField.data.byteLength
  if (fileSize > MAX_FILE_SIZE) {
    throw createError({
      status: 413,
      statusText: 'Payload Too Large',
      message: `文件过大: ${(fileSize / 1024 / 1024).toFixed(2)} MB,最大 5 MB`,
    })
  }

  // 转 base64 提交 ImgBB
  // imgBB 接受 base64 编码的图片数据(name="image")
  const base64 = btoa(
    Array.from(imageField.data).map(b => String.fromCharCode(b)).join(''),
  )

  // 调 ImgBB API
  try {
    const body = new FormData()
    body.append('image', base64)
    if (imageField.filename) {
      body.append('name', imageField.filename.replace(/\.[^/.]+$/, '')) // 去扩展名
    }

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body,
    })

    if (!res.ok) {
      console.error('[upload-image] ImgBB HTTP', res.status, await res.text())
      throw createError({
        status: 502,
        statusText: 'Bad Gateway',
        message: '图床服务异常,请稍后重试',
      })
    }

    const json = await res.json() as any
    if (!json.success || !json.data?.url) {
      console.error('[upload-image] ImgBB 响应异常:', json)
      throw createError({
        status: 502,
        message: '上传失败',
      })
    }

    return {
      url: json.data.url,
      displayUrl: json.data.display_url,
      thumbUrl: json.data.thumb?.url,
      width: json.data.width,
      height: json.data.height,
      size: json.data.size,
      deleteUrl: json.data.delete_url, // 给用户可选地保留
    }
  }
  catch (err: any) {
    if (err?.statusCode) throw err // 已经是 createError
    console.error('[upload-image] 上传异常:', err?.message)
    throw createError({
      status: 500,
      message: '上传失败: ' + (err?.message || 'unknown'),
    })
  }
})