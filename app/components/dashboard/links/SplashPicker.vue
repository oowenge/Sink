<script setup>
import { Edit, Plus, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps({
  templateId: { type: String, default: '' },
  overrides: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:templateId', 'update:overrides'])

// 通过 API 试探判断:能成功获取模板列表 = admin
const isAdmin = ref(false)

// 模板列表
const templates = ref([])
const loadingList = ref(false)

async function loadTemplates() {
  loadingList.value = true
  try {
    const res = await useAPI('/api/admin/splash-templates')
    templates.value = res?.templates || []
    isAdmin.value = true // 成功 = admin
  }
  catch (err) {
    // 403 = 非 admin,静默
    isAdmin.value = false
  }
  finally {
    loadingList.value = false
  }
}

onMounted(loadTemplates)

// 选模板
function onSelectTemplate(v) {
  emit('update:templateId', v === '__none__' ? '' : v)
}

function onClearTemplate() {
  emit('update:templateId', '')
  emit('update:overrides', {})
}

// 覆盖字段
const overrideForm = computed({
  get: () => props.overrides || {},
  set: (v) => emit('update:overrides', v),
})

function setOverride(key, value) {
  const next = { ...overrideForm.value }
  if (value === '' || value === null || value === undefined) {
    delete next[key]
  }
  else {
    next[key] = value
  }
  emit('update:overrides', next)
}

// 当前选中的模板对象(用于显示原始值)
const selectedTemplate = computed(() => {
  return templates.value.find(t => t.id === props.templateId) || null
})

// ===== 模板编辑对话框 =====
const dialogOpen = ref(false)
const dialogMode = ref('create') // 'create' / 'edit'
const dialogForm = ref({
  name: '',
  title: '',
  subtitle: '',
  imageUrl: '',
  buttonText: '',
  buttonColor: '#0066cc',
  bgColor: '#ffffff',
  textColor: '#1a1a1a',
  countdownSeconds: 5,
  pixelFacebook: '',
  pixelGoogleAds: '',
  pixelTiktok: '',
  pixelTwitter: '',
  customHtml: '',
})

function openCreate() {
  dialogMode.value = 'create'
  dialogForm.value = {
    name: '',
    title: '即将跳转',
    subtitle: '页面将在几秒后自动跳转',
    imageUrl: '',
    buttonText: '立即跳转',
    buttonColor: '#0066cc',
    bgColor: '#ffffff',
    textColor: '#1a1a1a',
    countdownSeconds: 5,
    pixelFacebook: '',
    pixelGoogleAds: '',
    pixelTiktok: '',
    pixelTwitter: '',
    customHtml: '',
  }
  dialogOpen.value = true
}

function openEdit() {
  if (!selectedTemplate.value) return
  dialogMode.value = 'edit'
  dialogForm.value = {
    name: selectedTemplate.value.name || '',
    title: selectedTemplate.value.title || '',
    subtitle: selectedTemplate.value.subtitle || '',
    imageUrl: selectedTemplate.value.imageUrl || '',
    buttonText: selectedTemplate.value.buttonText || '',
    buttonColor: selectedTemplate.value.buttonColor || '#0066cc',
    bgColor: selectedTemplate.value.bgColor || '#ffffff',
    textColor: selectedTemplate.value.textColor || '#1a1a1a',
    countdownSeconds: selectedTemplate.value.countdownSeconds ?? 5,
    pixelFacebook: selectedTemplate.value.pixelFacebook || '',
    pixelGoogleAds: selectedTemplate.value.pixelGoogleAds || '',
    pixelTiktok: selectedTemplate.value.pixelTiktok || '',
    pixelTwitter: selectedTemplate.value.pixelTwitter || '',
    customHtml: selectedTemplate.value.customHtml || '',
  }
  dialogOpen.value = true
}

const saving = ref(false)
async function saveTemplate() {
  if (!dialogForm.value.name || !dialogForm.value.name.trim()) {
    toast.error('请填写模板名')
    return
  }
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      const created = await useAPI('/api/admin/splash-templates', {
        method: 'POST',
        body: dialogForm.value,
      })
      await loadTemplates()
      toast.success('模板已创建')
      emit('update:templateId', created.id)
    }
    else {
      await useAPI(`/api/admin/splash-templates/${selectedTemplate.value.id}`, {
        method: 'PUT',
        body: dialogForm.value,
      })
      await loadTemplates()
      toast.success('模板已更新')
    }
    dialogOpen.value = false
  }
  catch (err) {
    console.error(err)
    toast.error(err?.data?.message || '保存失败')
  }
  finally {
    saving.value = false
  }
}

const deleteConfirm = ref('')
async function deleteTemplate() {
  if (!selectedTemplate.value) return
  if (deleteConfirm.value !== '确认删除') {
    toast.error('请在输入框里输入"确认删除"')
    return
  }
  try {
    await useAPI(`/api/admin/splash-templates/${selectedTemplate.value.id}`, {
      method: 'DELETE',
    })
    await loadTemplates()
    toast.success('模板已删除')
    emit('update:templateId', '')
    emit('update:overrides', {})
    deleteConfirm.value = ''
  }
  catch (err) {
    toast.error(err?.data?.message || '删除失败')
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 模板选择 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <Label class="text-xs">选择模板</Label>
        <div v-if="isAdmin" class="flex gap-1">
          <Button type="button" variant="outline" size="sm" @click="openCreate">
            <Plus class="w-3 h-3 mr-1" /> 新建模板
          </Button>
          <Button
            v-if="selectedTemplate"
            type="button" variant="outline" size="sm"
            @click="openEdit"
          >
            <Edit class="w-3 h-3 mr-1" /> 编辑
          </Button>
        </div>
      </div>
      <Select
        :model-value="props.templateId || '__none__'"
        @update:model-value="onSelectTemplate"
      >
        <SelectTrigger>
          <SelectValue placeholder="不使用中转页" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">不使用中转页(直接跳转)</SelectItem>
          <SelectItem
            v-for="t in templates"
            :key="t.id"
            :value="t.id"
          >
            {{ t.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="!templates.length && !loadingList" class="text-xs text-muted-foreground">
        还没有模板。{{ isAdmin ? '点击右上角"新建模板"创建。' : '请联系管理员创建。' }}
      </p>
    </div>

    <!-- 覆盖字段(仅当选了模板) -->
    <div v-if="selectedTemplate" class="space-y-3 rounded-md border p-3 bg-muted/20">
      <p class="text-xs text-muted-foreground">
        以下字段可针对此链接覆盖模板默认值,留空 = 用模板原值
      </p>

      <div class="space-y-1">
        <Label class="text-xs">标题(覆盖)</Label>
        <Input
          :model-value="overrideForm.title || ''"
          :placeholder="`模板默认: ${selectedTemplate.title || '无'}`"
          @input="e => setOverride('title', e.target.value)"
        />
      </div>

      <div class="space-y-1">
        <Label class="text-xs">副标题(覆盖)</Label>
        <Input
          :model-value="overrideForm.subtitle || ''"
          :placeholder="`模板默认: ${selectedTemplate.subtitle || '无'}`"
          @input="e => setOverride('subtitle', e.target.value)"
        />
      </div>

      <div class="space-y-1">
        <Label class="text-xs">图片(覆盖)</Label>
        <DashboardImagePicker
          :model-value="overrideForm.imageUrl || ''"
          placeholder="图片网址(留空 = 用模板默认)"
          @update:model-value="v => setOverride('imageUrl', v)"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <Label class="text-xs">按钮文字(覆盖)</Label>
          <Input
            :model-value="overrideForm.buttonText || ''"
            :placeholder="selectedTemplate.buttonText || '默认'"
            @input="e => setOverride('buttonText', e.target.value)"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">倒计时秒数(覆盖)</Label>
          <Input
            type="number" min="0" max="60"
            :model-value="overrideForm.countdownSeconds ?? ''"
            :placeholder="String(selectedTemplate.countdownSeconds ?? 5)"
            @input="e => setOverride('countdownSeconds', e.target.value ? Number(e.target.value) : null)"
          />
        </div>
      </div>

      <Separator />

      <p class="text-xs font-medium">跟踪像素(本链接专属,与模板独立)</p>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <Label class="text-xs">Facebook Pixel ID</Label>
          <Input
            :model-value="overrideForm.pixelFacebook || ''"
            placeholder="如 1234567890"
            @input="e => setOverride('pixelFacebook', e.target.value)"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Google Ads/GA ID</Label>
          <Input
            :model-value="overrideForm.pixelGoogleAds || ''"
            placeholder="G-XXXXXX / AW-XXXX"
            @input="e => setOverride('pixelGoogleAds', e.target.value)"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">TikTok Pixel ID</Label>
          <Input
            :model-value="overrideForm.pixelTiktok || ''"
            placeholder="如 CXXXXX"
            @input="e => setOverride('pixelTiktok', e.target.value)"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Twitter Pixel ID</Label>
          <Input
            :model-value="overrideForm.pixelTwitter || ''"
            placeholder="如 oXXXX"
            @input="e => setOverride('pixelTwitter', e.target.value)"
          />
        </div>
      </div>

      <div class="space-y-1">
        <Label class="text-xs">自定义 HTML 片段</Label>
        <textarea
          :value="overrideForm.customHtml || ''"
          class="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm font-mono"
          placeholder="任意 HTML/JS(其他平台像素脚本等)"
          @input="e => setOverride('customHtml', e.target.value)"
        />
      </div>
    </div>

    <!-- 模板编辑对话框 -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {{ dialogMode === 'create' ? '新建' : '编辑' }} Splash 模板
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-3">
          <div class="space-y-1">
            <Label class="text-xs">模板名 *</Label>
            <Input v-model="dialogForm.name" placeholder="如:营销活动模板" />
          </div>

          <div class="space-y-1">
            <Label class="text-xs">标题</Label>
            <Input v-model="dialogForm.title" />
          </div>

          <div class="space-y-1">
            <Label class="text-xs">副标题</Label>
            <Input v-model="dialogForm.subtitle" />
          </div>

          <div class="space-y-1">
            <Label class="text-xs">中心图片</Label>
            <DashboardImagePicker v-model="dialogForm.imageUrl" />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <Label class="text-xs">按钮文字</Label>
              <Input v-model="dialogForm.buttonText" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">倒计时秒数(0 = 不自动跳)</Label>
              <Input v-model.number="dialogForm.countdownSeconds" type="number" min="0" max="60" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="space-y-1">
              <Label class="text-xs">按钮颜色</Label>
              <input v-model="dialogForm.buttonColor" type="color" class="w-full h-9 rounded border cursor-pointer">
            </div>
            <div class="space-y-1">
              <Label class="text-xs">背景色</Label>
              <input v-model="dialogForm.bgColor" type="color" class="w-full h-9 rounded border cursor-pointer">
            </div>
            <div class="space-y-1">
              <Label class="text-xs">文字色</Label>
              <input v-model="dialogForm.textColor" type="color" class="w-full h-9 rounded border cursor-pointer">
            </div>
          </div>

          <Separator />
          <p class="text-xs font-medium">默认跟踪像素(每个使用此模板的链接都会触发)</p>

          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <Label class="text-xs">Facebook Pixel ID</Label>
              <Input v-model="dialogForm.pixelFacebook" placeholder="纯数字" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">Google Ads/GA</Label>
              <Input v-model="dialogForm.pixelGoogleAds" placeholder="G-/AW-/UA-" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">TikTok Pixel ID</Label>
              <Input v-model="dialogForm.pixelTiktok" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">Twitter Pixel ID</Label>
              <Input v-model="dialogForm.pixelTwitter" />
            </div>
          </div>

          <div class="space-y-1">
            <Label class="text-xs">自定义 HTML(其他像素/脚本)</Label>
            <textarea
              v-model="dialogForm.customHtml"
              class="w-full h-24 rounded-md border bg-background px-3 py-2 text-sm font-mono"
              placeholder="如百度统计/微信像素等"
            />
          </div>

          <!-- 删除区(仅编辑模式) -->
          <div v-if="dialogMode === 'edit'" class="space-y-1 rounded-md border border-destructive/40 p-3 bg-destructive/5">
            <Label class="text-xs text-destructive">危险操作:删除模板</Label>
            <p class="text-xs text-muted-foreground">
              输入"确认删除"后点删除按钮
            </p>
            <div class="flex gap-2">
              <Input v-model="deleteConfirm" placeholder="输入: 确认删除" />
              <Button type="button" variant="destructive" size="sm" @click="deleteTemplate">
                <Trash2 class="w-3 h-3 mr-1" /> 删除
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">取消</Button>
          <Button :disabled="saving" @click="saveTemplate">
            {{ saving ? '保存中...' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>