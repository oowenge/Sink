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

export const RuleSchema = z.discriminatedUnion('type', [
  CountryRuleSchema,
  TimeRuleSchema,
  AbRuleSchema,
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
})