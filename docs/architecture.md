# 系统架构

## 总览

Sink 是 Cloudflare Pages + Workers KV 的短链服务。
没有传统数据库 / 没有持久 server / 完全 serverless。

```
用户浏览器 ─┬─ Cloudflare Edge Network ─┬─ Pages(Nuxt SSR + Server API)
            │                          │
            │                          └─ Workers KV (键值存储)
            │
            └─ DNS: cturl.dpdns.org / afun.center → Pages 部署
```

技术栈:

- **Nuxt 3 / 4 兼容版** + Vue 3
- **TypeScript**(server 全 ts,前端 sfc)
- **Cloudflare Workers KV**(存链接、用户、session)
- **Cloudflare Analytics Engine** (WAE)(存访问日志,SQL 查询)
- **Tailwind CSS** + shadcn-vue 组件库

## 数据模型

### 1. 链接 (link:{slug})

KV key:`link:abc123`,value 是 JSON:

```json
{
  "id": "kchqtxnr98",                       // Sink 内部 ID(用于 WAE 的 index1 字段)
  "url": "https://target-website.com/page",  // 跳转目标
  "slug": "abc123",                          // 短链路径
  "owner": "owen",                           // 谁创建的(Day 2 加的)
  "createdAt": 1777571749,
  "updatedAt": 1777571749,
  "comment": "可选备注"
}
```

KV metadata(用于列表展示和短链跳转):

```json
{
  "url": "...",
  "comment": "...",
  "expiration": null
}
```

> 关键:**短链跳转(redirect)只读 metadata 的 url**,不读 value。
> 所以 metadata 必须有 url——否则跳转会失效。

### 2. 用户 (user:{username})

KV key:`user:owen`,value:

```json
{
  "username": "owen",
  "passwordHash": "pbkdf2$100000${salt-hex}${hash-hex}",
  "role": "admin",                  // "admin" | "user"
  "displayName": "OWEN",
  "createdAt": 1777986798,
  "lastLoginAt": 1777997048,
  "disabled": false
}
```

passwordHash 是 PBKDF2 + SHA-256 + 16 字节随机 salt + 100,000 次迭代,
和 server/utils/password.ts 算法严格一致(Day 1 写的)。

### 3. Session (session:{token})

KV key:`session:KdpJ8nLsP7m...`(随机 32 字节 base64,40+ 字符),value:

```json
{
  "username": "owen",
  "role": "admin",
  "createdAt": 1777986798
}
```

TTL = 7 天(KV 自动过期),用户登录时创建,登出时删除。

## 关键流程

### 登录

```
浏览器 POST /api/auth/login {username, password}
  ↓
server/api/auth/login.post.ts
  ↓
KV.get(user:{username}) → 取出 passwordHash
  ↓
verifyPassword(input, storedHash) → 比对
  ↓
通过 → 生成新 session token, KV.put(session:{token}) TTL 7d
  ↓
更新 user 记录的 lastLoginAt
  ↓
响应 {token, username, role}
  ↓
前端 localStorage.setItem('SinkSiteToken', token)
```

### 鉴权(每个 /api/* 请求)

```
请求带 Authorization: Bearer <token>
  ↓
server/middleware/2.auth.ts 拦截
  ↓
跳过 /api/auth/login(允许未登录)和 /api/_*(Nuxt 内部)
  ↓
new track:KV.get(session:{token}) → 有就拿到 username + role
  ↓ 都没有
old track:对比 NUXT_SITE_TOKEN
  ↓ 匹配
event.context.user = {username: "admin", role: "admin"}
  ↓ 都不匹配
401 Unauthorized
```

### 创建短链(写 owner)

```
POST /api/link/create {url, slug?}
  ↓
中间件已经把 user 注入 event.context.user
  ↓
server/api/link/create.post.ts
  ↓
LinkSchema.parse(body) — slug 不传就随机生成
  ↓
(link as any).owner = event.context.user.username
  ↓
KV.put(link:{slug}, JSON.stringify(link), { metadata: { url, comment } })
  ↓
返回 {link, shortLink}
```

### 列出链接(权限过滤)

```
GET /api/link/list?limit=20
  ↓
requireAuth(event) → currentUser
  ↓
分批 KV.list({ prefix:'link:', limit: 30 }) — 30 是 Workers 子请求并发安全值
  ↓
Promise.all(批内 30 条 KV.getWithMetadata) — 并发但限量
  ↓
filter(link => canAccessLink(currentUser, link)):
  - admin → 全部通过
  - user → owner === username 才通过
  ↓
凑够 limit 就停;没凑够继续翻页(MAX_SCAN_PAGES = 10 兜底)
  ↓
响应 {links, list_complete, cursor}
```

### 编辑/删除/查询单条

`edit.put.ts`、`delete.post.ts`、`query.get.ts` 都在动作前先:
1. KV.get 取出 link
2. 调用 canAccessLink(user, link)
3. 不通过 → 抛 404(假装链接不存在,防 slug 枚举)

注意是 **404 不是 403** — 这是有意的。详见 [pitfalls.md](./pitfalls.md)。

### 统计接口(WAE SQL)

```
GET /api/stats/counters?startAt=..&endAt=..
  ↓
getOwnerSlugsForFilter(event):
  - admin → 返回 undefined
  - user → 扫 KV 拿到所有 owner=username 的 slug 数组
  ↓
query2filter(query, ownerSlugs):
  - 构造 WHERE 子句
  - 如果 ownerSlugs 不是 undefined,加 `AND blob1 IN (...)`
  - 如果 ownerSlugs 是空数组,加恒假条件让 SQL 返回 0 行
  ↓
useWAE(event, sql) → Cloudflare Analytics Engine 查询
  ↓
返回汇总数据
```

## 项目目录

```
E:\Projects\Sink\
├── app\                         前端 Vue 应用
│   ├── components\
│   │   ├── dashboard\
│   │   │   ├── Nav.vue          顶部 Tab 栏(链接/分析/实时/用户管理)
│   │   │   ├── users\
│   │   │   │   └── Index.vue    用户管理页主组件
│   │   │   └── ...
│   │   └── login\
│   │       └── index.vue        登录页(密码 + token 双轨)
│   └── pages\
│       └── dashboard\
│           ├── users.vue        用户管理路由
│           └── ...
├── server\                      后端 API
│   ├── api\
│   │   ├── auth\               鉴权 (Day 1)
│   │   │   ├── login.post.ts
│   │   │   ├── logout.post.ts
│   │   │   └── me.get.ts
│   │   ├── admin\              管理员 API (Day 3)
│   │   │   └── users\
│   │   │       ├── index.get.ts             列表
│   │   │       ├── index.post.ts            创建
│   │   │       ├── [username].put.ts        修改
│   │   │       └── [username].delete.ts     删除+链接转移
│   │   ├── link\               链接 CRUD
│   │   ├── stats\              统计 (WAE SQL)
│   │   └── ...
│   ├── middleware\
│   │   ├── 1.redirect.ts        短链跳转(不需登录)
│   │   └── 2.auth.ts            鉴权(双轨)
│   └── utils\
│       ├── password.ts          PBKDF2 哈希
│       ├── session.ts           Session CRUD
│       ├── permissions.ts       canAccessLink + getOwnerSlugsForFilter
│       └── query-filter.ts      WAE SQL 构造工具
├── docs\                        本目录
│   ├── SYSTEM_INFO.md           入口
│   ├── architecture.md          本文件
│   ├── operations.md
│   ├── pitfalls.md
│   └── changelog.md
├── i18n\                        多语言
│   └── locales\
│       └── zh-CN.json
└── backups\                     一次性脚本和备份(在 .gitignore 里,不入库)
```

## 设计原则

### 1. 安全优先

- 密码用 PBKDF2 哈希(100k 迭代)+ 随机 salt
- API 永不返回 passwordHash
- 用户编辑链接尝试改 owner 字段 → 后端硬保留原 owner
- 用户访问别人的资源 → 返回 404 而不是 403(防 slug 枚举)

### 2. 双轨鉴权

- 主轨:用户名 + 密码 → session token
- 备轨:NUXT_SITE_TOKEN(管理员兜底,以防主轨损坏)

### 3. 不动短链跳转

无论怎么改,server/middleware/1.redirect.ts 不动。
短链跳转必须公开 + 高速 + 不依赖鉴权状态。

### 4. 渐进式权限模型

只有 admin 和 user 两种角色。**故意不做更细粒度的权限**:
- 多余的复杂度对 10 人内的团队没价值
- 加角色容易,删角色难——先简单再迭代

### 5. 测试环境优先

任何改动:**先在 afun.center 测,通过后再上 cturl.dpdns.org**。
两个项目的 git 仓库完全独立,代码移植靠脚本/手工 sync。
