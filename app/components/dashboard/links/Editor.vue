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

  errors.value = { url: '', slug: '' }
  showOptional.value = !!(props.link.comment || props.link.expiration
    || (Array.isArray(props.link.rules) && props.link.rules.length > 0)
    || props.link.redirectStatus)
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