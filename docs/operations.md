# 运维手册

> 系统日常运维手册。涵盖加用户、改密码、紧急访问、迁移到新环境等场景。

## 1. 给同事开账号

### 用 dashboard UI(常规方式)

1. 用 owen 登录 cturl.dpdns.org 或 afun.center
2. 顶部 Tab 点"用户管理"
3. 右上角"新建用户"
4. 填表:
   - 用户名:3-20 位,只允许 `a-z A-Z 0-9 _ -`
   - 密码:至少 8 位
   - 角色:**普通用户**(默认)/ 管理员
   - 显示名:可选,留空就用用户名
5. 点"创建"
6. 把账号密码告诉同事

> 提醒同事:首次登录后,**自己改一次密码**(防你也知道密码)。

### 直接写 KV(紧急情况)

如果 dashboard 鉴权坏了,可以直接写 KV。需要 KV 写权限的临时 token。

参考脚本:`backups/create-owen.cjs`,改 USERNAME / PASSWORD / DISPLAY_NAME 即可:

```powershell
$env:CF_API_TOKEN = "你的临时 KV token"
cd E:\Projects\Sink\backups
node create-owen.cjs   # 改过 USERNAME 后
```

详见 [pitfalls.md](./pitfalls.md) 的"创建 KV 临时 token"章节。

## 2. 改密码

### 改自己的密码

1. 登录后进"用户管理"
2. 点自己那一行的"编辑"
3. 在"新密码"框输入新密码
4. 角色不会让你自己改(防自降级)
5. 保存

### 改别人的密码(admin 操作)

同上,只是点别人那一行的编辑。

### 忘了 owen 密码怎么办

参考下面"紧急访问"。

## 3. 禁用 / 启用用户

进用户管理 → 点该用户的"禁用"按钮(❌ 图标)→ 确认。

被禁用的用户:
- 仍然在 KV 里(数据保留)
- 不能登录(login.post.ts 检查 disabled 字段)
- admin 可以重新启用

## 4. 删除用户(链接转移)

进用户管理 → 点该用户的"删除"按钮(🗑 红色)→ 确认。

**会发生**:
1. 该用户的 KV 记录被删除
2. 该用户名下所有 `link:*` 的 owner 字段被改成**当前操作者**
3. 已存在的 session token 即使没过期,登录时查 user 找不到也会拒绝

> 链接转移是**自动**的,不可逆。删除前确认接手人。

## 5. 紧急访问(忘密码 / 系统坏)

### 场景 1:owen 忘了密码

1. 登录页选"改用 token 登录"
2. 输入 `NUXT_SITE_TOKEN`(在 Cloudflare 项目设置里查)
3. 进入 dashboard 后,**立刻**进用户管理给 owen 改密码
4. 退出 token 登录,用新密码 + 用户名登录验证

### 场景 2:rm 错误,数据丢了

参考下面"从备份恢复"。

### 场景 3:鉴权中间件坏了,login API 也调不通

最坏情况——直接绕过 server,通过 KV 操作:

1. 在 Cloudflare Dashboard → Workers KV → 找到对应命名空间
2. 找 `user:owen` 这条记录
3. 编辑 value,把 `disabled` 字段改成 false(如果是被改成 true 了)
4. 或者删除这条记录,然后用 `backups/create-owen.cjs` 重新创建

如果是中间件代码 bug,需要回滚:

```powershell
cd E:\Projects\Sink
git log --oneline -10                       # 看最近的提交
git revert <某个 commit hash> --no-edit     # 回滚
git push                                     # 触发 Cloudflare 部署回滚版
```

## 6. 创建/修改/删除链接

dashboard 里直接做。注意:
- 普通用户只能管理自己的链接(看不到别人的)
- admin 能管理所有人的链接
- **删除链接 ≠ 失效**——KV 记录被删,但 Cloudflare 边缘可能有几秒缓存

## 7. KV 临时管理 token(运维场景)

某些场景需要临时 KV 写权限:
- 批量数据迁移
- 修复损坏的记录
- 紧急创建用户

### 创建临时 token

1. https://dash.cloudflare.com/profile/api-tokens
2. **Create Token** → **Custom token**
3. 名字:`KV Migration Temp`(临时,用完删)
4. Permissions:`Account` → `Workers KV Storage` → `Edit`
5. Account Resources:All accounts(或具体选)
6. **TTL:设明天结束**(自动过期更安全)
7. Create → 复制 token(只显示一次!)

### 用完立刻删

回到 https://dash.cloudflare.com/profile/api-tokens,
找到这个 token → `⋯` → Delete。

> **永远不要把 KV 写权限的 token 提交到 git** 或贴在聊天里。

## 8. 数据备份

### 备份 prod KV

```powershell
$env:CF_API_TOKEN = "你的临时 KV token"
cd E:\Projects\Sink\backups
node backup.cjs       # Day 0 写过这个脚本
```

输出文件:`backups/kv-backup-prod-{timestamp}.json`(包含所有 link:* 和 user:* 数据)

> 备份文件 60KB 左右,每月做一次足够。

### 从备份恢复某条记录

如果某条 link 损坏(metadata 丢失等),可以从备份单条恢复。
参考 `backups/restore-via-api.cjs` 的写法,改 TARGET_KEYS 数组即可。

## 9. 部署新版代码

### 测试环境(afun)

```powershell
cd E:\Projects\AFUNSink
# 改完代码
git add -A
git commit -m "feat: xxx"
git push
```

GitHub push 触发 Cloudflare Pages 自动部署,2-3 分钟生效。

### 生产环境(cturl)

**先在测试环境跑通,再上生产**。

```powershell
# 把测试环境改动同步到生产
cd E:\Projects\Sink
# 复制改过的文件...
git add -A
git commit -m "feat: xxx (从 afun 移植)"
git push
```

> 详细的 afun → cturl 移植脚本参见 [changelog.md](./changelog.md) 的 Day 5 章节。

## 10. 常用查询命令

### 看某条 link 的内容

```powershell
cd C:\
wrangler kv key get "link:abc123" --namespace-id=<NS_ID> --remote --text
```

NS_ID:
- afun:`6f01ba36572b4cf6bead465ff3ac53ab`
- cturl:`5a179ec9e3e148c8a3c2a19b69495aa3`

> **必须 cd C:\**,因为在 AFUNSink/Sink 目录里跑 wrangler 会读到 wrangler.jsonc 的项目名,触发命名规则错误。

### 看某个 user 的内容

```powershell
wrangler kv key get "user:owen" --namespace-id=<NS_ID> --remote --text
```

### 看所有 link 数量

```powershell
wrangler kv key list --namespace-id=<NS_ID> --remote --prefix=link: | ConvertFrom-Json | Measure-Object | Select-Object Count
```

## 11. Token 轮换(定期安全维护)

建议每 3-6 个月做一次。涉及 4 类 token:

| Token | 用途 | 怎么轮换 |
|---|---|---|
| owen 的密码 | dashboard 登录 | 用户管理 → 编辑 owen → 改密码 |
| NUXT_SITE_TOKEN | 兜底鉴权 | 生成新随机串 → Cloudflare 项目环境变量替换 → 触发空部署 |
| NUXT_CF_API_TOKEN | Pages 部署 | 新建 Pages:Edit token → 替换环境变量 → 删旧 token |
| KV 临时 token | 一次性运维 | 不需要轮换,**每次用完立刻删** |

详细操作步骤参见 [changelog.md](./changelog.md) 的 Day 5 任务 B / D。

## 12. 添加新管理员

```
1. owen 登录后
2. 用户管理 → 新建用户 → 角色选"管理员"
3. 创建后告诉对方账号密码
```

> 至少保留 2 个 admin 账号,以防 owen 自己出意外被锁出来。
> 但**不要给所有人 admin** —— 给可信赖的副手即可。

## 13. 系统监控

定期看(月级):
- Cloudflare Pages → afunsink/sink → 部署历史(看是否有失败的部署)
- Cloudflare KV → 命名空间 → 看键数量变化趋势(突然暴涨可能是异常)
- afun/cturl dashboard → 用户管理 → 看 lastLoginAt(发现长期不登录的账号可以禁用)

> 没有专门的监控告警系统(Sink 太小不需要)——人工月查一次足够。
