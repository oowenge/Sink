import { customAlphabet } from 'nanoid'
import { z } from 'zod'

const { slugRegex } = useAppConfig()

const slugDefaultLength = +useRuntimeConfig().public.slugDefaultLength

export const nanoid = (length: number = slugDefaultLength) => customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', length)

export const LinkSchema = z.object({
  id: z.string().trim().max(26).default(nanoid(10)),
  url: z.string().trim().url().max(2048),
  slug: z.string().trim().max(2048).regex(new RegExp(slugRegex)).default(nanoid()),
  comment: z.string().trim().max(2048).optional(),
  createdAt: z.number().int().safe().default(() => Math.floor(Date.now() / 1000)),
  updatedAt: z.number().int().safe().default(() => Math.floor(Date.now() / 1000)),
  expiration: z.number().int().safe().refine(expiration => expiration > Math.floor(Date.now() / 1000), {
    message: 'expiration must be greater than current time',
    path: ['expiration'], // 这里指定错误消息关联到哪个字段
  }).optional(),
  title: z.string().trim().max(2048).optional(),
  description: z.string().trim().max(2048).optional(),
  image: z.string().trim().url().max(2048).optional(),
})
// shared/schemas/link.ts —— 在文件末尾追加

import { z } from 'zod'

// 单条批量项:复用 LinkSchema,但所有字段都可选(slug 缺省时自动生成)
export const BatchLinkItemSchema = z.object({
  url: z.string().trim().url('Invalid URL'),
  slug: z.string().trim().regex(slugRegex).optional().or(z.literal('')),
  comment: z.string().trim().max(2048).optional().or(z.literal('')),
  expiration: z.number().int().positive().optional(),
})

export const BatchLinkSchema = z.object({
  // 最多一次 500 条;超过让用户分两次,避免 Worker CPU 超时
  links: z.array(BatchLinkItemSchema).min(1).max(500),
  // 冲突策略:skip = 跳过已存在的 slug;overwrite = 覆盖
  onConflict: z.enum(['skip', 'overwrite']).default('skip'),
})

export type BatchLinkItem = z.infer<typeof BatchLinkItemSchema>
export type BatchLinkPayload = z.infer<typeof BatchLinkSchema>
