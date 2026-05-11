<script setup>
import { Loader2, Shuffle, Sparkles } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { nanoid } from '@@/schemas/link'

const props = defineProps({
  link: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['update:link'])

const { t } = useI18n()
const { previewMode } = useRuntimeConfig().public
const dialogOpen = ref(false)
const isEdit = !!props.link.id
const submitting = ref(false)

// 表单状态
const form = ref({
  url: '',
  slug: '',
  comment: '',
  expiration: '', // datetime-local 字符串,如 "2026-12-31T23:59"
  rules: [], // 跳转规则数组
  redirectStatus: '', // 重定向状态码: '' / '301' / '302' / '307'
  tags: [], // 标签数组
  password: '', // 明文密码(仅提交时使用,响应不返回)
  hasPassword: false, // 标记当前链接是否已设置密码
  passwordAction: 'keep', // 'keep' 保留 / 'change' 修改 / 'remove' 删除
  passwordLang: 'auto', // 'auto' 自动检测 / 具体语言代码
  ogTitle: '', // 用户手填的 OG 标题(优先级高于自动抓取)
  ogDescription: '', // 用户手填的 OG 描述
  ogImage: '', // 用户手填的 OG 图片 URL
  qrConfig: null, // QR 码自定义配置
  splashTemplateId: '', // Splash 模板 ID
  splashOverrides: {}, // Splash 局部覆盖字段
})

const aiSlugPending = ref(false)
const showOptional = ref(false) // 高级选项默认折叠

// 校验状态
const errors = ref({
  url: '',
  slug: '',
})

// 初始化表单(打开弹窗时)
function initForm() {
  form.value.url = props.link.url || ''
  form.value.slug = isEdit ? (props.link.slug || '') : nanoid()()
  form.value.comment = props.link.comment || ''
  form.value.rules = Array.isArray(props.link.rules) ? JSON.parse(JSON.stringify(props.link.rules)) : []

  // 把 unix 时间戳转成 datetime-local 字符串
  if (props.link.expiration) {
    const d = new Date(props.link.expiration * 1000)
    const pad = n => String(n).padStart(2, '0')
    form.value.expiration = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  else {
    form.value.expiration = ''
  }

  form.value.redirectStatus = props.link.redirectStatus ? String(props.link.redirectStatus) : ''
  form.value.tags = Array.isArray(props.link.tags) ? [...props.link.tags] : []
  form.value.hasPassword = !!props.link.passwordHash
  form.value.password = ''
  form.value.passwordAction = form.value.hasPassword ? 'keep' : 'change'
  form.value.passwordLang = props.link.passwordLang || 'auto'
  // OG 字段(读取用户手填的 title/description/image)
  form.value.ogTitle = props.link.title || ''
  form.value.ogDescription = props.link.description || ''
  form.value.ogImage = props.link.image || ''
  form.value.qrConfig = props.link.qrConfig || null
  form.value.splashTemplateId = props.link.splashTemplateId || ''
  form.value.splashOverrides = props.link.splashOverrides || {}

  errors.value = { url: '', slug: '' }
  showOptional.value = !!(props.link.comment || props.link.expiration
    || (Array.isArray(props.link.rules) && props.link.rules.length > 0)
    || props.link.redirectStatus
    || (Array.isArray(props.link.tags) && props.link.tags.length > 0)
    || props.link.passwordHash
    || props.link.title || props.link.description || props.link.image
    || props.link.qrConfig
    || props.link.splashTemplateId)
}

// 弹窗打开时初始化
watch(dialogOpen, (open) => {
  if (open) initForm()
})

// 随机生成 slug
function randomSlug() {
  form.value.slug = nanoid()()
}

// AI 生成 slug
async function aiSlug() {
  if (!form.value.url) {
    toast.error('请先填写目标网址')
    return
  }
  aiSlugPending.value = true
  try {
    const { slug } = await useAPI('/api/link/ai', {
      query: { url: form.value.url },
    })
    form.value.slug = slug
  }
  catch (error) {
    console.log(error)
    toast.error('AI 生成失败')
  }
  finally {
    aiSlugPending.value = false
  }
}

// 自动补全 https:// 前缀
function normalizeUrl(url) {
  if (url && !/^https?:\/\//i.test(url)) {
    return 'https://' + url
  }
  return url
}

// 提交表单
async function onSubmit() {
  errors.value = { url: '', slug: '' }

  // URL 校验 + 自动补全
  let url = form.value.url.trim()
  if (!url) {
    errors.value.url = '请填写目标网址'
    return
  }
  url = normalizeUrl(url)
  try {
    new URL(url) // 验证格式
  }
  catch {
    errors.value.url = '网址格式无效'
    return
  }

  // Slug 校验
  const slug = form.value.slug.trim()
  if (!slug) {
    errors.value.slug = '请填写短链路径'
    return
  }
  if (!/^[a-zA-Z0-9-_]{1,2048}$/.test(slug)) {
    errors.value.slug = '只能用字母、数字、连字符、下划线'
    return
  }

  // 构建 link 对象
  const linkData = {
    url,
    slug,
  }

  if (form.value.comment.trim()) {
    linkData.comment = form.value.comment.trim()
  }

  // 过期时间转 unix timestamp
  if (form.value.expiration) {
    const ts = Math.floor(new Date(form.value.expiration).getTime() / 1000)
    if (ts > Math.floor(Date.now() / 1000)) {
      linkData.expiration = ts
    }
    else {
      errors.value.url = '过期时间必须是未来'
      return
    }
  }

  // 规则数组(过滤掉无效的)
  if (Array.isArray(form.value.rules) && form.value.rules.length > 0) {
    linkData.rules = form.value.rules
  }

  // 重定向状态码
  if (form.value.redirectStatus) {
    linkData.redirectStatus = Number(form.value.redirectStatus)
  }

  // 标签数组
  if (Array.isArray(form.value.tags) && form.value.tags.length > 0) {
    linkData.tags = form.value.tags
  }
  // 密码处理
  if (form.value.passwordAction === 'change' && form.value.password) {
    // 新增/修改密码
    if (form.value.password.length < 4 || form.value.password.length > 32) {
      errors.value.url = '密码长度需 4-32 位'
      return
    }
    linkData.password = form.value.password
  }
  else if (form.value.passwordAction === 'remove') {
    // 删除密码(传空字符串,后端会清除 passwordHash)
    linkData.password = ''
  }
  // 'keep' 不传 password 字段,后端保留原 passwordHash
  // 密码页语言(只在有密码或正在新增密码时才需要)
  if (form.value.hasPassword || (form.value.passwordAction === 'change' && form.value.password)) {
    linkData.passwordLang = form.value.passwordLang
  }
  // OG 自定义卡片(表单字段 -> schema 字段)
  if (form.value.ogTitle.trim()) linkData.title = form.value.ogTitle.trim()
  if (form.value.ogDescription.trim()) linkData.description = form.value.ogDescription.trim()
  // QR 码自定义配置
  if (form.value.qrConfig && typeof form.value.qrConfig === 'object') {
    linkData.qrConfig = form.value.qrConfig
  }
  // Splash 中转页
  if (form.value.splashTemplateId) {
    linkData.splashTemplateId = form.value.splashTemplateId
    if (form.value.splashOverrides && Object.keys(form.value.splashOverrides).length > 0) {
      linkData.splashOverrides = form.value.splashOverrides
    }
  }

  submitting.value = true
  try {
    const { link: newLink } = await useAPI(isEdit ? '/api/link/edit' : '/api/link/create', {
      method: isEdit ? 'PUT' : 'POST',
      body: linkData,
    })
    dialogOpen.value = false
    emit('update:link', newLink, isEdit ? 'edit' : 'create')
    toast.success(isEdit ? t('links.update_success') : t('links.create_success'))
  }
  catch (error) {
    console.error(error)
    toast.error(error?.data?.message || error?.message || '保存失败')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogTrigger as-child>
      <slot>
        <Button class="ml-2" variant="outline">
          {{ $t('links.create') }}
        </Button>
      </slot>
    </DialogTrigger>
    <DialogContent class="max-w-[95svw] max-h-[95svh] md:max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto]">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? $t('links.edit') : $t('links.create') }}</DialogTitle>
      </DialogHeader>

      <p v-if="previewMode" class="text-sm text-muted-foreground">
        {{ $t('links.preview_mode_tip') }}
      </p>

      <div class="overflow-y-auto px-2 space-y-4 py-2">
        <!-- 目标网址 -->
        <div class="space-y-2">
          <Label for="url">
            目标网址 <span class="text-destructive">*</span>
          </Label>
          <Input
            id="url"
            v-model="form.url"
            placeholder="https://example.com"
            :class="errors.url ? 'border-destructive' : ''"
          />
          <p v-if="errors.url" class="text-xs text-destructive">
            {{ errors.url }}
          </p>
          <p v-else class="text-xs text-muted-foreground">
            支持自动补全 https:// 前缀
          </p>
        </div>

        <!-- 短链路径 -->
        <div class="space-y-2">
          <Label for="slug">
            短链路径 <span class="text-destructive">*</span>
          </Label>
          <div class="relative">
            <Input
              id="slug"
              v-model="form.slug"
              :disabled="isEdit"
              placeholder="abc123"
              :class="['pr-20', errors.slug ? 'border-destructive' : '']"
            />
            <div v-if="!isEdit" class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <Shuffle
                class="w-4 h-4 cursor-pointer hover:text-primary"
                title="随机生成"
                @click="randomSlug"
              />
              <Sparkles
                class="w-4 h-4 cursor-pointer hover:text-primary"
                :class="{ 'animate-pulse': aiSlugPending }"
                title="AI 生成"
                @click="aiSlug"
              />
            </div>
          </div>
          <p v-if="errors.slug" class="text-xs text-destructive">
            {{ errors.slug }}
          </p>
        </div>

        <!-- 高级选项(折叠) -->
        <div class="border-t pt-4">
          <button
            type="button"
            class="flex items-center justify-between w-full text-sm font-medium hover:text-primary"
            @click="showOptional = !showOptional"
          >
            <span>高级选项</span>
            <span class="text-xs text-muted-foreground">
              {{ showOptional ? '收起 ▲' : '展开 ▼' }}
            </span>
          </button>

          <div v-if="showOptional" class="mt-4 space-y-4 pl-1">
            <!-- 备注 -->
            <div class="space-y-2">
              <Label for="comment">备注</Label>
              <Textarea
                id="comment"
                v-model="form.comment"
                placeholder="例如:春节活动落地页"
                rows="3"
              />
            </div>

            <!-- 过期时间 -->
            <div class="space-y-2">
              <Label for="expiration">过期时间</Label>
              <Input
                id="expiration"
                v-model="form.expiration"
                type="datetime-local"
              />
              <p class="text-xs text-muted-foreground">
                到期后短链将失效。留空表示永不过期。
              </p>
            </div>

            <!-- UTM 参数构建器 -->
            <div class="space-y-2">
              <Label>UTM 参数</Label>
              <DashboardLinksUtmBuilder v-model="form.url" />
            </div>

<!-- 标签 -->
            <div class="space-y-2">
              <Label>标签</Label>
              <DashboardLinksTagsEditor v-model="form.tags" />
            </div>
<!-- 密码保护 -->
            <div class="space-y-2">
              <Label>密码保护</Label>

              <!-- 当前已设置密码时,显示状态 + 操作选项 -->
              <div v-if="form.hasPassword" class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-primary">
                  <span>🔒 此链接已设置密码</span>
                </div>
                <Select v-model="form.passwordAction">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">
                      保留当前密码
                    </SelectItem>
                    <SelectItem value="change">
                      修改密码
                    </SelectItem>
                    <SelectItem value="remove">
                      删除密码(移除保护)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  v-if="form.passwordAction === 'change'"
                  v-model="form.password"
                  type="password"
                  placeholder="新密码(4-32 位)"
                  maxlength="32"
                  autocomplete="new-password"
                />
              </div>

              <!-- 当前未设置密码 -->
              <div v-else class="space-y-2">
                <Input
                  v-model="form.password"
                  type="password"
                  placeholder="留空 = 不启用密码保护(4-32 位)"
                  maxlength="32"
                  autocomplete="new-password"
                />
              </div>

              <!-- 密码页语言 -->
              <div v-if="form.hasPassword || form.password" class="space-y-1 pt-2">
                <Label class="text-xs">密码页语言</Label>
                <Select v-model="form.passwordLang">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      🌐 自动检测(根据访客浏览器)
                    </SelectItem>
                    <SelectItem value="zh">
                      🇨🇳 中文
                    </SelectItem>
                    <SelectItem value="en">
                      🇺🇸 English
                    </SelectItem>
                    <SelectItem value="pt">
                      🇧🇷 Português
                    </SelectItem>
                    <SelectItem value="es">
                      🇪🇸 Español
                    </SelectItem>
                    <SelectItem value="ja">
                      🇯🇵 日本語
                    </SelectItem>
                    <SelectItem value="ko">
                      🇰🇷 한국어
                    </SelectItem>
                    <SelectItem value="fr">
                      🇫🇷 Français
                    </SelectItem>
                    <SelectItem value="de">
                      🇩🇪 Deutsch
                    </SelectItem>
                    <SelectItem value="ar">
                      🇸🇦 العربية
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p class="text-xs text-muted-foreground">
                访问者需要输入密码才能跳转。失败 5 次会锁 10 分钟(同 IP)。密码验证后浏览器记住 24 小时。
              </p>
            </div>

            <!-- 自定义社交预览卡片 (OG) -->
            <Collapsible>
              <CollapsibleTrigger class="flex items-center gap-2 text-sm font-medium hover:text-primary py-2">
                <span>🎴 自定义社交预览卡片(OG)</span>
                <span v-if="form.ogTitle || form.ogDescription || form.ogImage" class="text-xs text-primary">(已配置)</span>
              </CollapsibleTrigger>
              <CollapsibleContent class="space-y-3 pt-2">
                <p class="text-xs text-muted-foreground">
                  自定义链接被分享到 WhatsApp / iMessage / Twitter / Telegram 等平台时显示的预览卡片。
                  留空时会自动从目标网址抓取(7 天缓存)。
                </p>

                <div class="space-y-2">
                  <Label class="text-xs">预览标题</Label>
                  <Input
                    v-model="form.ogTitle"
                    placeholder="留空 = 自动从目标网址抓取"
                    maxlength="200"
                  />
                </div>

                <div class="space-y-2">
                  <Label class="text-xs">预览描述</Label>
                  <Textarea
                    v-model="form.ogDescription"
                    placeholder="留空 = 自动从目标网址抓取"
                    rows="2"
                    maxlength="500"
                  />
                </div>

                <div class="space-y-2">
                  <Label class="text-xs">预览图片</Label>
                  <DashboardImagePicker
                    v-model="form.ogImage"
                    placeholder="留空 = 自动从目标网址抓取"
                  />
                </div>

                <!-- 实时预览 -->
                <div class="pt-2">
                  <DashboardLinksOgPreview
                    :url="form.url"
                    :title="form.ogTitle"
                    :description="form.ogDescription"
                    :image="form.ogImage"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <!-- 自定义 QR 码 -->
            <Collapsible>
              <CollapsibleTrigger class="flex items-center gap-2 text-sm font-medium hover:text-primary py-2">
                <span>📱 自定义 QR 码</span>
                <span v-if="form.qrConfig && form.qrConfig.preset !== 'classic'" class="text-xs text-primary">(已自定义)</span>
              </CollapsibleTrigger>
              <CollapsibleContent class="space-y-3 pt-2">
                <p class="text-xs text-muted-foreground">
                  自定义 QR 码颜色、样式、Logo。所有改动会保存到此链接,下次打开 QR 时自动应用。
                </p>
                <DashboardLinksQRCustomizer
                  v-model="form.qrConfig"
                  :short-link-url="form.url ? (form.slug ? `${$config.public.siteUrl || ''}/${form.slug}` : form.url) : ''"
                  :slug="form.slug || 'preview'"
                />
              </CollapsibleContent>
            </Collapsible>
            <!-- 🚀 Splash 中转页 -->
            <Collapsible>
              <CollapsibleTrigger class="flex items-center gap-2 text-sm font-medium hover:text-primary py-2">
                <span>🚀 中转页 (Splash) + 跟踪像素</span>
                <span v-if="form.splashTemplateId" class="text-xs text-primary">(已启用)</span>
              </CollapsibleTrigger>
              <CollapsibleContent class="space-y-3 pt-2">
                <p class="text-xs text-muted-foreground">
                  访问短链时先显示一个中转页(5 秒倒计时),可挂 Facebook/Google/TikTok 像素做广告再营销。
                </p>
                <DashboardLinksSplashPicker
                  :template-id="form.splashTemplateId"
                  :overrides="form.splashOverrides"
                  @update:template-id="v => form.splashTemplateId = v"
                  @update:overrides="v => form.splashOverrides = v"
                />
              </CollapsibleContent>
            </Collapsible>

            <!-- 跳转状态码 -->
            <div class="space-y-2">
              <Label>重定向状态码</Label>
              <Select v-model="form.redirectStatus">
                <SelectTrigger>
                  <SelectValue placeholder="使用全局默认" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    使用全局默认
                  </SelectItem>
                  <SelectItem value="301">
                    301 永久重定向(推荐,SEO 友好,浏览器会缓存)
                  </SelectItem>
                  <SelectItem value="302">
                    302 临时重定向(浏览器不缓存,适合频繁更换目标)
                  </SelectItem>
                  <SelectItem value="307">
                    307 临时重定向(同 302 但保留 POST 方法)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">
                有跳转规则的链接会强制使用 302(防 CDN 缓存)
              </p>
            </div>

            <!-- 跳转规则 -->
            <div class="space-y-2">
              <Label>跳转规则</Label>
              <p class="text-xs text-muted-foreground">
                高级功能:可让短链根据国家、时间段或 A/B 权重跳转到不同 URL。规则按从上到下顺序匹配。
              </p>
              <DashboardLinksRulesEditor v-model="form.rules" />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button type="button" variant="secondary" class="mt-2 sm:mt-0">
            {{ $t('common.close') }}
          </Button>
        </DialogClose>
        <Button :disabled="submitting" @click="onSubmit">
          <Loader2 v-if="submitting" class="w-4 h-4 mr-2 animate-spin" />
          {{ $t('common.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>