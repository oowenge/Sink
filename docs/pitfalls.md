# 踩坑笔记

> 5 天开发期间踩过的所有坑。改代码前花 30 秒翻一下,能省几个小时排查时间。

## 一、Cloudflare Workers 限制

### 1.1 KV 子请求并发上限 ≈ 30(最重要的一条!)

**症状**:`/api/link/list` 返回 500,但前端 fetcher 只看到 `{statusCode: 500, message: "Server Error"}`,没具体错误。

**原因**:Workers 单次请求**同时并发的子请求**(`KV.get`、`KV.getWithMetadata` 等)有上限,大约 ~50。
我们用 `Promise.all(131 个 KV.getWithMetadata)` 直接超限,Worker 抛错。

**反例(错的)**:
```typescript
// list.get.ts 老代码
const list = await KV.list({ prefix: 'link:', limit: 1024 })
const enriched = await Promise.all(list.keys.map(async (k) => {
  return await KV.getWithMetadata(k.name, { type: 'json' })
}))
// 131 条全部并发 → 500
```

**正例(对的)**:
```typescript
const KV_PAGE_SIZE = 30   // 安全并发值
const list = await KV.list({ prefix: 'link:', limit: KV_PAGE_SIZE })
const enriched = await Promise.all(list.keys.map(...))   // 30 个并发,OK
// 不够? 翻页继续
```

**适用于**:list.get.ts、search.get.ts、所有"扫全表"的接口。

**记忆口诀**:**KV 操作分批 30**。

### 1.2 Worker CPU time 也有上限

虽然 Cloudflare 没明确公布数字,但**几百次串行 await KV.get 也会触发 CPU time 超限**——表现和并发超限类似(500 错误)。

避免方法:
- 不要 `for await KV.get`(串行 200 次会超时)
- 不要 `Promise.all(超过 30 个 KV.get)`(并发超限)
- **每批 30 个并发,跨批用 await 串行**

### 1.3 Cloudflare 部署需要 2-3 分钟

`git push` 之后:
- GitHub webhook 触发 Cloudflare 构建
- npm run build 编译 Nuxt
- 部署到 Edge

总共 2-3 分钟。**不要急着测试**——可能你测的还是老代码。

## 二、Cloudflare KV API 

### 2.1 KV.put 不传 metadata 会清空(Day 2 最大的坑)

**症状**:Day 2 v2 迁移脚本跑完后,3 条链接的 metadata 丢失,短链跳转 404。

**原因**:KV.put(key, value, { metadata: ... }) — **如果 options 不传 metadata,KV 把已有 metadata 清空,而不是保留**。

**正例**:
```typescript
// 即使你不需要改 metadata,也要把现有 metadata 重新传一遍
await KV.put(key, JSON.stringify(value), {
  expiration,
  metadata: { ...existingMetadata },   // 传一下,即使不变
})
```

**记忆**:**修改 link 必须读出 metadata 再写回去**。

### 2.2 wrangler kv key put + 含 `&` 的 URL = 蛋疼

**症状**:某些 link 的 url 带 query string 有 `&`,wrangler --metadata 参数走 cmd shell,& 被当成命令分隔符,只写入了一部分,剩下的当成另一条命令执行,触发各种诡异错误。

**修复方案**:**用 Cloudflare REST API 多 part/form-data 上传,完全绕开 shell**。
参考脚本:`backups/migrate-via-api.cjs`(REST API + multipart)。

**记忆**:**批量改 KV 一律用 REST API,不用 wrangler**。

### 2.3 wrangler list 的 prefix 参数对 `:` 严格

REST API GET `/keys?prefix=link:abc` — 有时 Cloudflare 把 `:` 当不合法字符,400。

**修复**:用 `URLSearchParams` 标准化拼参数:

```typescript
const params = new URLSearchParams({ prefix: 'link:abc', limit: '1' })
const url = `https://...?${params}`
```

`URLSearchParams` 自动正确转义。

### 2.4 KV.list 的 cursor 不能传空字符串

**症状**:`list.get.ts` 第一次调用,前端 cursor 没传,代码 fallback 给 KV.list `cursor: ""`(空字符串),Cloudflare 直接抛 500。

**正例**:
```typescript
const listOptions: any = { prefix: 'link:', limit: 30 }
if (cursor) {
  listOptions.cursor = cursor    // 有值才加
}
await KV.list(listOptions)       // 不传 cursor 比传空字符串安全
```

## 三、Cloudflare API Token

### 3.1 默认 NUXT_CF_API_TOKEN 没有 KV 权限

**症状**:用项目环境变量里的 token 调 KV REST API → 401 Unauthorized。

**原因**:Cloudflare Pages 项目自动创建的 API token 通常只有 **Pages:Edit** 权限,**没有 Workers KV Storage:Edit**。

**修复**:运维场景**单独创建一个有 KV 权限的临时 token**,用完立刻删。

详见 [operations.md](./operations.md) 的"创建 KV 临时 token"。

### 3.2 不要把 token 贴在聊天 / git / 任何能被搜索的地方

5 天里我们泄露过若干 token,虽然事后全部轮换了,**但下次别再发生**。

如果不小心泄露:
- 立刻去 Cloudflare API Tokens 删除
- 新建同样权限的 token
- 替换到所有用它的地方
- 触发空部署生效

## 四、wrangler CLI

### 4.1 wrangler 不能在项目根目录跑(Sink/AFUNSink 项目)

**症状**:在 `E:\Projects\AFUNSink` 下跑 wrangler kv 命令 → 报错 `Expected "name" to be alphanumeric and lowercase`。

**原因**:wrangler 启动会读取当前目录的 `wrangler.jsonc`,Sink/AFUNSink 项目里 `name` 字段是大写的(`AFUNSink`、`Sink`),触发 wrangler 4 的命名校验。

**修复**:**先 cd 到 C:\(或任何不是项目目录的地方)再跑 wrangler**。

```powershell
cd C:\
wrangler kv key get "link:abc" --namespace-id=... --remote --text
```

### 4.2 wrangler 4 的 CF_API_TOKEN 警告

```
Using "CF_API_TOKEN" environment variable. This is deprecated. Please use "CLOUDFLARE_API_TOKEN", instead.
```

不影响功能,可以忽略。如要消除:

```powershell
$env:CLOUDFLARE_API_TOKEN = $env:CF_API_TOKEN
```

## 五、PowerShell

### 5.1 方括号 `[]` 是通配符(Day 5 大坑)

**症状**:`Copy-Item "...\[username].put.ts" "..."` 静默跳过,文件没复制成功(连错都不报)。

**原因**:PowerShell 的路径里方括号是 `wildcard`,被解释成"匹配任意字符之一"。

**修复**:用 `-LiteralPath` 参数:

```powershell
Copy-Item -LiteralPath "E:\...\[username].put.ts" `
          -Destination "E:\...\[username].put.ts"

Test-Path -LiteralPath "E:\...\[username].put.ts"

dir -LiteralPath "E:\...\users"
```

**Get-Item / Test-Path / Copy-Item / Remove-Item 等所有路径相关命令**都受影响。

### 5.2 macOS Terminal 显示 hyperlink

**症状**:粘贴包含 `--namespace-id=xxxxx` 的命令到 Terminal,有时会显示成"Markdown 风格"的链接,但**实际写入的字符是干净的**。

不影响功能,只是显示问题。

### 5.3 PowerShell 命令折行用反引号

```powershell
Copy-Item -LiteralPath "E:\source\file.txt" `
          -Destination "E:\dest\file.txt"
```

`` ` ``(反引号)是续行符,不是普通引号。

## 六、Nuxt / Vue

### 6.1 Nuxt server auto-import 加新工具函数后必须重启 dev

**症状**:在 `server/utils/foo.ts` 加一个新函数 `myUtil`,在某个 API 里用 `myUtil(...)`,VS Code 报"找不到名称 myUtil"。

**修复**:重启 `pnpm dev`。Nuxt 启动时扫描 server/utils 生成 `.nuxt/types/nitro-imports.d.ts`,加文件后必须重新生成。

**记忆**:**加新文件 = 重启 dev**。

### 6.2 子目录组件的自动注册命名规则不一致

**症状**:`app/components/dashboard/users/Index.vue` —— 应该自动注册成 `<DashboardUsersIndex />`,但实际可能注册不出来(取决于 Nuxt 版本和配置)。

**修复**:**用相对路径 import,不依赖自动注册**。

```vue
<script setup>
import UsersIndex from '../../components/dashboard/users/Index.vue'
</script>

<template>
  <UsersIndex />
</template>
```

### 6.3 `~` 别名在 Nuxt 4 里指向不同位置

Nuxt 3:`~` 通常指项目根。
Nuxt 4 / `compatibility version 4`:`~` 可能指 `app/` 子目录。

**修复**:不确定就用相对路径(`../`)代替 `~`,绝对安全。

### 6.4 i18n 路径在 afun 和 sink 之间不一样

- afun:`app/i18n/locales/zh-CN.json`(在 app 目录里)
- sink:`i18n/locales/zh-CN.json`(在根目录)

复制 i18n 翻译时**注意目标路径**。

### 6.5 文件末尾换行符

afun 的 ESLint 配置允许文件末尾不换行(`No newline at end of file`),
sink 可能不允许。

**修复**:复制文件后,**统一加末尾 `\n`**。
PowerShell 脚本参考 changelog.md 的 Day 5 章节。

## 七、shadcn-vue 组件库

### 7.1 SelectItem 不允许空值 value

**症状**:`<SelectItem value="">全部</SelectItem>` → 整个 dashboard 页面 404。

**修复**:用占位符代替空字符串:`<SelectItem value="ALL">全部</SelectItem>`,然后代码里判断 value === 'ALL' 当作空。

### 7.2 Tailwind 颜色限定

Sink 项目 Tailwind 配置只允许:`woot / green / yellow / red / violet / slate`。
**用 `amber / orange / blue / pink` 等会编译警告或失效**。

## 八、Cloudflare Analytics Engine (WAE)

### 8.1 SQL 字段名是 blob1, blob2... 不是字段名

WAE 表结构:
- `blob1` = slug
- `blob2` = referer
- `blob3` = user-agent
- `blob4` = ip
- `blob5` = country
- `blob6` = ...

`server/utils/access-log.ts` 是写入逻辑,定义了 blob1-blob10 对应什么。
读取(stats 接口)就用 blob1, blob2 直接 SELECT。

### 8.2 WAE SQL 不支持 LIMIT 0 等优化

避免空 IN 子句:

```sql
SELECT ... WHERE blob1 IN ()   -- 报错
SELECT ... WHERE blob1 IN ('') -- 慢
```

我们的处理:**user 没有任何 slug 时,提前返回空数据,不构造 SQL**。

参考:`server/api/stats/compare.get.ts` 顶部:
```typescript
if (ownerSlugs !== undefined && ownerSlugs.length === 0) {
  return { data: [], total: 0, ... }
}
```

## 九、Git

### 9.1 backups/ 必须在 .gitignore 里

否则迁移脚本、备份 JSON、临时 token 都会推到 GitHub。

```
# .gitignore
backups/
```

### 9.2 GitHub push 偶尔会"permission denied"

**症状**:第一次 push 报权限错,过几秒重试就成功。

不是真的权限问题,只是 GitHub flake。**重试一次即可**。

### 9.3 跨 repo 移植代码不能 git cherry-pick

**测试 afun (ricotony7438/AFUNSink) 和生产 cturl (oowenge/Sink) 是两个完全独立的 repo**,git cherry-pick 不直接工作。

**修复**:用 PowerShell `Copy-Item` 批量复制文件 → 手动 commit。
脚本参考 `changelog.md` 的 Day 5 章节(完整迁移脚本)。

## 十、运行时调试技巧

### 10.1 Cloudflare 实时日志

定位线上 500 错误:
1. Cloudflare Dashboard → Workers 和 Pages → 项目 → 部署 → 最新部署
2. 进部署详情 → 函数 Tab → 实时日志
3. 点 "开始日志流"
4. 浏览器复现错误
5. 日志里看 console.error 输出

### 10.2 诊断版接口模式

线上接口 500 但日志看不到细节时,临时把 handler 改成"返回 debug 对象":

```typescript
export default eventHandler(async (event) => {
  const debug: any = { step: 'start', user: null, error: null }
  try {
    debug.step = 'requireAuth'
    const u = requireAuth(event)
    debug.user = u
    debug.step = 'KV.list'
    const page = await KV.list({ prefix: 'link:', limit: 5 })
    debug.gotKeys = page.keys?.length
    debug.step = 'done'
    return debug
  } catch (err: any) {
    debug.error = { message: err?.message, stack: err?.stack?.slice(0, 1000) }
    return debug
  }
})
```

部署 → 调接口 → 看响应里 `step` 卡在哪、`error` 内容是什么 → 锁定问题 → 改回正常版本。

Day 4 list.get.ts 的 500 就是用这招定位的。

## 总结:改代码前的检查清单

- [ ] 涉及 KV 的循环操作,**Promise.all 不超过 30 个**
- [ ] KV.put 时 **metadata 必须显式传**(即使不变也要传)
- [ ] 含 `&` 的 URL **不能用 wrangler shell 命令**改 KV
- [ ] PowerShell 路径含方括号 → 加 `-LiteralPath`
- [ ] wrangler 命令在 C:\ 跑(不在项目根目录)
- [ ] 加 server/utils 新文件 → **重启 pnpm dev**
- [ ] 修改 token / 环境变量 → 触发空部署生效
- [ ] backups/ 必须在 .gitignore
