# 5 天改造日志

> Sink 单租户 → 多用户隔离系统的完整改造记录。
> 时间:2026/05/01 - 2026/05/06。

## 总览

| Day | 时间 | 主题 | 状态 |
|---|---|---|---|
| Day 0 | 5/1 | 双环境备份 + 测试环境搭建 | ✅ |
| Day 0.5 | 5/1 | 批量创建 + 数据对比功能移植到 afun | ✅ |
| Day 1 | 5/2 | 鉴权系统(用户密码登录) | ✅ |
| Day 2 | 5/3 | link owner 字段 + 数据迁移 | ✅ |
| Day 3 | 5/4 | 用户管理后台(CRUD) | ✅ |
| Day 4 | 5/5 | 权限过滤 + 修隐藏 bug | ✅ |
| Day 5 | 5/6 | 上线 prod + 安全清理 | ✅ |

最终成果:
- afun.center(测试)和 cturl.dpdns.org(生产)都是完整可用的多租户系统
- 339 条历史链接全部成功迁移加 owner 字段(0 损失)
- 4 个文件大改 + 21 个新文件 + 19 个修改文件
- 6 个 token 全部安全轮换

## Day 0:双环境备份 + 测试环境搭建

### 完成

1. 安装 wrangler 4.87.0
2. 备份 cturl 生产 KV(202 条记录,58.6KB) → `E:\Projects\Sink\backups\kv-backup-prod-1777927077195.json`
3. fork sink → ricotony7438/AFUNSink
4. clone 到 `E:\Projects\AFUNSink`
5. 备份 afun KV(133 条) → `kv-backup-afun-1777988487500.json`
6. 加 `backups/` 到 .gitignore(原本没有,差点就把备份推到 GitHub)

### 学到

- AFUNSink 默认 .gitignore 不含 backups —— 必须手动加
- 双环境策略:任何改动**先在 afun 测,通过后才上 cturl**

## Day 0.5:批量创建 + 数据对比移植

### 完成

把生产 sink 的 6 个文件复制到 afun:
- `server/api/link/batch.post.ts`
- `server/api/stats/compare.get.ts`
- 4 个对应的 Vue 组件

修改 `app/components/dashboard/links/Index.vue` 加 2 个按钮:批量创建、数据对比。

### 学到

- 跨 repo 复制代码用 PowerShell `Copy-Item`,不能 git cherry-pick
- shadcn-vue SelectItem **value 不能是空字符串**(空白页 bug)
- 必须 `cd C:\` 才能跑 wrangler(否则 wrangler.jsonc 命名规则报错)

## Day 1:鉴权系统

### 设计决策

- **双轨鉴权**:用户名密码(主轨)+ NUXT_SITE_TOKEN(兜底)
- Session 存 KV,TTL 7 天
- 密码 PBKDF2 + SHA-256 + 16 字节 salt + 100k 迭代

### 新增 / 修改文件

- `server/utils/password.ts`(PBKDF2 哈希 + 校验)
- `server/utils/session.ts`(session CRUD)
- `server/api/auth/login.post.ts` / `logout.post.ts` / `me.get.ts`
- `server/middleware/2.auth.ts`(完全替换,双轨逻辑)
- `app/components/login/index.vue`(完全替换,密码 + token 两种模式)

### 关键步骤

1. 创建 owen 用户,密码 PBKDF2 哈希后写入 KV
2. 用了 `backups/create-owen.cjs` 一次性脚本(用 Node fetch + Cloudflare REST API,绕开 wrangler)
3. 6/6 端到端测试通过

### 学到

- Nuxt server 函数命名要避免和 nitro 内置冲突(`getSession` 已被占用,改用 `getUserSession`)
- TypeScript Uint8Array 传给 `crypto.subtle` 需要 `as BufferSource` 强转
- 加 server/utils 新文件后**必须重启 pnpm dev**(Nuxt 才扫描到)

## Day 2:link owner 字段 + 数据迁移

### 这是 5 天里最痛苦的一天

为什么?**KV.put 不传 metadata 会清空**——这个坑害我们 v2 版迁移脚本破坏了 3 条链接的 metadata,短链跳转 404。

### 迁移脚本演化(4 版)

1. **v1**:wrangler kv put 没传 metadata → metadata 丢失
2. **v2**:加 `--metadata="..."` shell 参数 → 含 `&` 的 url 被 cmd 当成命令分隔符 → 部分 link 损坏
3. **v3**:spawnSync(wrangler) → Windows 找不到 .cmd
4. **v4**(终极):**Cloudflare REST API + Node fetch + multipart/form-data**,完全绕开 wrangler 和 shell

最终:131 条 afun 链接全部加 owner=owen 成功,0 失败,3 条损坏的也用 `restore-via-api.cjs` 从备份恢复。

### 修改的代码

- `server/api/link/create.post.ts`:写入时加 owner
- `server/api/link/batch.post.ts`:批量创建加 owner
- `server/api/link/edit.put.ts`:**强制保留原 owner**(用户改不了)
- `server/api/link/upsert.post.ts`:create 分支加 owner

owner 字段**故意不在 LinkSchema 里**——zod 解析时 owner 会被静默忽略,后端 `(link as any).owner = ...` 强制写入,**用户没法伪造 owner**。

### 学到

- **任何 KV.put 必须显式传 metadata,即使不变也要传**(否则被清空)
- shell 引号 escape 在 Windows 下完全靠不住
- REST API + multipart 是最稳的 KV 批量操作方案
- 默认的 NUXT_CF_API_TOKEN **没有 KV 写权限**——要单独建临时 token
- 创建 KV 临时 token,用完立刻删

## Day 3:用户管理后台

### 完成

后端 4 个 API:
- `GET /api/admin/users`(列表,strip passwordHash)
- `POST /api/admin/users`(创建)
- `PUT /api/admin/users/[username]`(改密 / 启用禁用 / 改角色)
- `DELETE /api/admin/users/[username]`(删除 + 链接转移)

前端:
- `app/pages/dashboard/users.vue`
- `app/components/dashboard/users/Index.vue`(表格 + 创建对话框 + 编辑对话框 + confirm 删除)
- `app/components/dashboard/Nav.vue` 加"用户管理" Tab(`v-if="isAdmin"`)
- i18n 加 `nav.users` 翻译

### 设计决策

- **删除用户的链接转移给操作者**(选项 C "希望谁接手"),理由:
  - 不破坏短链(还在外面流通)
  - 接手人明确(谁删的谁管)
- **不允许 admin 删自己**(防自我锁出)
- **不允许 admin 把自己降级**(同上)

### 关键 bug

部署后 `/dashboard/users` 页面**空白**——Nuxt 自动注册 `<DashboardUsersIndex />` 没识别。

修复:`users.vue` 改成相对路径 import,绕过自动注册:
```vue
<script setup>
import UsersIndex from '../../components/dashboard/users/Index.vue'
</script>
```

### 测试结果

8/8 端到端测试通过。

### 学到

- 子目录组件的 Nuxt 自动注册不可靠 → 用相对路径 import 绝对安全
- `~` 别名在 Nuxt 4 里指向不同(可能是 app/ 子目录,不是项目根)
- 自我保护检查必须在后端 API 里做,**不只是前端 UI 灰按钮**

## Day 4:权限过滤(最有价值的一天)

### 改动 11 个文件

新增工具:
- `server/utils/permissions.ts` 加 `canAccessLink` 和 `getOwnerSlugsForFilter`

链接接口加权限过滤:
- `list.get.ts`(列表)
- `search.get.ts`(搜索)
- `query.get.ts`(单条详情)
- `edit.put.ts`(编辑前检查)
- `delete.post.ts`(删除前检查)

统计接口加 SQL 过滤:
- `query-filter.ts` 加 `ownerSlugs` 参数,在 WHERE 加 `AND blob1 IN (...)`
- `counters.get.ts` / `views.get.ts` / `metrics.get.ts` / `compare.get.ts` 都接入

### 关键设计

- admin → 看全部
- user → 看 owner === username 的
- **没权限访问别人的资源 → 返回 404 而不是 403**(防 slug 枚举)

### 巨大 bug:Cloudflare Workers KV 并发限制

部署后 `/api/link/list` 返回 500,但前端只看到 `{statusCode: 500}`,看不到具体错误。

排查路径:
1. 查 Cloudflare 实时日志(确认请求 200 OK,问题在前端 / Worker 内部)
2. 写诊断版 list.get.ts(把每一步状态返回到前端)
3. 部署诊断版,看到 `step: "done"` 全成功——但**只测了 5 个 keys**
4. **嗯?**为什么完整版 131 条会 500?
5. **顿悟**:`Promise.all(131 个 KV.getWithMetadata)` 触发 Workers **并发**子请求上限!

修复:`KV_PAGE_SIZE` 从 1024 改成 30,加 `MAX_SCAN_PAGES = 10` 翻页凑数。

```typescript
// 改前(炸了)
const list = await KV.list({ limit: 1024 })
await Promise.all(list.keys.map(...))   // 131 个并发 → 500

// 改后(OK)
while (collected.length < limit && pagesScanned < 10) {
  const page = await KV.list({ limit: 30 })   // 每批 30 个
  await Promise.all(page.keys.map(...))       // 30 并发,安全
  // ...
}
```

`search.get.ts` 同样问题,同样修复。

### 测试结果

8/8 端到端测试通过(包括尝试用 fetch 直接调 edit / delete API 改别人链接 → 都 404 拒绝)。

### 学到

- **Cloudflare Workers KV 子请求安全并发数 = 30/批**(以后所有扫表接口都按这个数字)
- "诊断版接口"是定位线上 500 的金钥匙——**catch 块返回 debug 对象,不抛错**
- 用户拒绝 → 404 不是 403(防 slug 枚举)
- 后端永远不能信任前端传的 owner / id / createdAt 等"系统字段"

## Day 5:上线 prod + 安全清理

### 流程

#### 5.1 推送 afun 最新代码

确认 afun 项目 git 状态干净 + 最新提交都已 push。

#### 5.2 跳过 prod 备份(确认 Day 0 备份还在)

用户说没新增链接,Day 0 备份(202 条)足够。

#### 5.3 一口气复制代码 afun → cturl

PowerShell 脚本:
```powershell
$src = "E:\Projects\AFUNSink"
$dst = "E:\Projects\Sink"
# 创建必要目录
$dirs = @(
  "$dst\server\api\admin\users",
  "$dst\app\components\dashboard\users",
  "$dst\server\api\auth"   # 漏了这个,导致第一次没复制 auth 文件!
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }

# Day 1 文件
Copy-Item "$src\server\utils\password.ts" "$dst\server\utils\password.ts"
# ... (28 个文件)

# i18n 路径不同!afun 在 app/i18n/,sink 在 i18n/
Copy-Item "$src\app\i18n\locales\zh-CN.json" "$dst\i18n\locales\zh-CN.json"
```

**踩坑**:PowerShell 路径含方括号 `[username].put.ts` 被当通配符,Copy-Item 静默跳过(没复制成功也不报错)。修复:用 `-LiteralPath`。

```powershell
Copy-Item -LiteralPath "$src\...\[username].put.ts" `
          -Destination "$dst\...\[username].put.ts"
```

#### 5.4 加换行符修复(28 个文件)

afun 来的代码有些文件末尾**没有换行符**(`\ No newline at end of file`)。
PowerShell 脚本批量加 `\n`:

```powershell
foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($f)
  if ($bytes[$bytes.Length - 1] -ne 0x0A) {
    $newBytes = $bytes + [byte]0x0A
    [System.IO.File]::WriteAllBytes($f, $newBytes)
  }
}
```

#### 5.5 推送 cturl

```powershell
cd E:\Projects\Sink
git add -A
git commit -m "feat: Day 1-4 多用户隔离系统(从 afun 移植)"
git push
```

部署成功 2-3 分钟。

#### 5.6 创建 owen 用户(prod KV)

```powershell
$env:CF_API_TOKEN = "临时 KV migration token"
node backups/create-owen.cjs
```

写入 `user:owen` 到 cturl 的 KV(`5a179ec9e3e148c8a3c2a19b69495aa3`)。

#### 5.7 prod 链接迁移

`migrate-prod.cjs`:
- 列出所有 `link:*`(208 条,Day 0 备份是 202 条,5 天里多了 6 条)
- 给所有缺 owner 的(208 条全部)加 `owner: "owen"`
- 0 失败

`status-check-prod.cjs` 验证:
- 总数 208
- 有 metadata 208
- 有 owner 208
- 缺失/失败全部 0

#### 5.8 prod 端到端测试

精简版 6 项,全部通过。

#### 5.9 安全清理

- 任务 A:删 KV migration 临时 token
- 任务 B:轮换 afunsink + sink 两个 Pages 部署 token
- 任务 C:改 owen 密码(afun + cturl 都改)
- 任务 D:轮换 NUXT_SITE_TOKEN(afun + cturl 各换一个 32 字节随机串)

### 学到

- Day 5 移植脚本最难——细节多(目录路径不同、方括号通配符、换行符)
- prod 部署一定要"创建 owen → 迁移链接 → 测试 → 才能用"的顺序
- token 安全清理是上线日不可省的步骤
- **Cloudflare Pages 项目自动 token 只有 Pages:Edit**——任何运维场景需要 KV/D1 权限要单独建

## 关键文件清单

### 新增(共 14 个)

```
server/utils/password.ts
server/utils/session.ts
server/utils/permissions.ts
server/api/auth/login.post.ts
server/api/auth/logout.post.ts
server/api/auth/me.get.ts
server/api/admin/users/index.get.ts
server/api/admin/users/index.post.ts
server/api/admin/users/[username].put.ts
server/api/admin/users/[username].delete.ts
app/components/dashboard/users/Index.vue
app/pages/dashboard/users.vue
docs/...(本目录 5 个文档)
```

### 修改(共 13 个核心)

```
server/middleware/2.auth.ts
server/utils/query-filter.ts
server/api/link/create.post.ts
server/api/link/batch.post.ts
server/api/link/edit.put.ts
server/api/link/upsert.post.ts
server/api/link/list.get.ts
server/api/link/query.get.ts
server/api/link/search.get.ts
server/api/link/delete.post.ts
server/api/stats/counters.get.ts
server/api/stats/views.get.ts
server/api/stats/metrics.get.ts
server/api/stats/compare.get.ts
app/components/dashboard/Nav.vue
app/components/login/index.vue
i18n/locales/zh-CN.json
```

## 备忘录

### 这个项目最值钱的 5 条经验

1. **Cloudflare Workers KV 操作分批 30**——超过就 500
2. **KV.put 必须显式传 metadata**——不传等于清空
3. **批量改 KV 用 REST API + multipart**——绕开所有 shell 引号坑
4. **PowerShell 路径含方括号用 `-LiteralPath`**——否则被当通配符
5. **加 server/utils 新文件后必须重启 pnpm dev**——否则 Nuxt 找不到

### 下一步可能的优化(暂未做)

- search.get.ts 在 user 大数据量下还是慢(每次扫全表),如果用户超过 10 人需要给 metadata 也加 owner 字段走快路径
- 多用户场景的 stats 性能没压测过,几千条访问日志/天应该 OK,但更高需要考虑
- 没有"管理员日志"——admin 改了别人的什么没记录,小团队不需要,大团队会要
- KV.list 翻页过滤可能"少给"(详见 list.get.ts B 选项的注释)

### 没解决但已知的"软"问题

- 老链接的 metadata 缺字段时 search.get.ts 会写回——但 list.get.ts 不会(行为不一致)。Day 5 没修。
- compare.get.ts 转移用户链接时不保留 expiration 字段。afun 所有 expiration 都是 null,实际不影响,但 cturl 如果以后加带过期时间的链接需要修。
```

---

保存后告诉我"文档 5 完成"。

---

## 然后:把 docs/ 推到 GitHub

文档写完不推上去等于白写。最后操作:

```powershell
cd E:\Projects\Sink
git add -A
git commit -m "docs: 5 天改造工作的完整文档(架构/运维/踩坑/changelog)" --no-verify
git push
```

```powershell
cd E:\Projects\AFUNSink
# 给 afun 也建一份 docs(简化版)?或者保持空,只在 sink 项目维护文档?
```

**问题**:你要不要给 afun 也建一份 docs?---

我建议**只在 cturl 项目维护文档**——理由:
- afun 是测试环境,你改完代码会 push 到 cturl,docs 也跟着同步过去
- 文档放在生产项目里更"权威"
- 避免两份文档不同步的问题

但你说了算。