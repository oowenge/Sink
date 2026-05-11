import { customAlphabet } from 'nanoid'
import { z } from 'zod'

const { slugRegex } = useAppConfig()
const slugDefaultLength = +useRuntimeConfig().public.slugDefaultLength
export const nanoid = (length: number = slugDefaultLength) => customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', length)

// 规则 schema(嵌套在 LinkSchema 内)
const TimeWindowSchema = z.object({
  start: z.string().regex(/^\d{1,2}:\d{2}$/),
  end: z.string().regex(/^\d{1,2}:\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
})

const CountryRuleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  type: z.literal('country'),
  match: z.array(z.string().trim().length(2)).min(1).max(50),
  url: z.string().trim().url().max(2048),
})

const TimeRuleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  type: z.literal('time'),
  tz: z.string().trim().min(1).max(60),
  windows: z.array(TimeWindowSchema).min(1).max(20),
  url: z.string().trim().url().max(2048),
})

const AbVariantSchema = z.object({
  url: z.string().trim().url().max(2048),
  weight: z.number().nonnegative().max(10000),
})

const AbRuleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  type: z.literal('ab'),
  variants: z.array(AbVariantSchema).min(2).max(20),
})

const DeviceRuleSchema = z.object({
  id: z.string().trim().min(1).max(40),
  type: z.literal('device'),
  match: z.array(z.enum(['mobile', 'tablet', 'desktop', 'ios', 'android', 'bot'])).min(1).max(6),
  url: z.string().trim().url().max(2048),
})

export const RuleSchema = z.discriminatedUnion('type', [
  CountryRuleSchema,
  TimeRuleSchema,
  AbRuleSchema,
  DeviceRuleSchema,
])

export const LinkSchema = z.object({
  id: z.string().trim().max(26).default(nanoid(10)),
  url: z.string().trim().url().max(2048),
  slug: z.string().trim().max(2048).regex(new RegExp(slugRegex)).default(nanoid()),
  comment: z.string().trim().max(2048).optional(),
  createdAt: z.number().int().safe().default(() => Math.floor(Date.now() / 1000)),
  updatedAt: z.number().int().safe().default(() => Math.floor(Date.now() / 1000)),
  expiration: z.number().int().safe().refine(expiration => expiration > Math.floor(Date.now() / 1000), {
    message: 'expiration must be greater than current time',
    path: ['expiration'],
  }).optional(),
  title: z.string().trim().max(2048).optional(),
  description: z.string().trim().max(2048).optional(),
  image: z.string().trim().url().max(2048).optional(),
  // 跳转规则数组(可选,老链接没有此字段)
  rules: z.array(RuleSchema).max(50).optional(),
  // 重定向状态码(可选,默认走全局 redirectStatusCode)
  // 有规则的链接会强制使用 302,此字段会被忽略
  redirectStatus: z.union([z.literal(301), z.literal(302), z.literal(307)]).optional(),
  // 标签数组(可选,小写,不含特殊字符,最多 10 个)
  tags: z.array(
    z.string().trim().toLowerCase().min(1).max(30).regex(/^[^,'"\\]+$/, '标签不能包含逗号、引号、反斜杠'),
  ).max(10).optional(),
  // 密码保护(可选,提交时可能是明文,后端会哈希;查询时返回 boolean 表示是否已设置)
  // 空字符串表示"删除密码",非空必须 4-32 位
  password: z.union([z.literal(''), z.string().trim().min(4).max(32)]).optional(),
  // 密码哈希(后端字段,前端不直接编辑)
  passwordHash: z.string().optional(),
  // 密码页语言('auto' 自动检测,或具体语言代码)
  passwordLang: z.enum(['auto', 'zh', 'en', 'pt', 'es', 'ja', 'ko', 'fr', 'de', 'ar']).optional(),
})