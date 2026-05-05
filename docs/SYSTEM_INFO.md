# Sink 多用户系统 - 总览

> 本文档是 Sink 项目自托管多用户改造的索引。
> 所有详细内容在 docs/ 子目录里。

## 项目定位

Sink 是一个基于 Cloudflare Pages + Workers KV 的短链服务。
本项目在原版 Sink 基础上做了**多用户隔离改造**,
让多个团队成员可以共用一个 Sink 部署,但每个人只能看见管理自己创建的链接。

## 部署环境

| 环境 | 域名 | 用途 | KV Namespace ID |
|---|---|---|---|
| 测试 | afun.center | 改动先在这里测 | `6f01ba3657b4cf16bead465ff3ac53ab` |
| 生产 | cturl.dpdns.org | 业务实际使用 | `5a179e9e3e1418c8a3c2a19b69495aa3` |

Cloudflare Account ID: `84b124fed532b8dcaac19beb1984a6a8`
本地代码:
- 测试:`E:\Projects\AFUNSink`(GitHub: ricotony7438/AFUNSink, master 分支)
- 生产:`E:\Projects\Sink`(GitHub: oowenge/Sink, master 分支)

## 文档导航

| 文件 | 内容 | 什么时候看 |
|---|---|---|
| [architecture.md](./architecture.md) | 架构 / 数据模型 / 关键流程 | 想理解系统怎么运转的 |
| [operations.md](./operations.md) | 运维手册(加用户、改密码、紧急访问) | 日常使用 / 给同事开账号 |
| [pitfalls.md](./pitfalls.md) | 踩坑笔记(KV 并发、wrangler 等) | 改代码前 / 排查 bug |
| [changelog.md](./changelog.md) | 5 天工作日志 | 想知道什么时候做了什么 |

## 三句话总结这个系统

1. **任何登录用户都能创建短链**,但**只能管理自己创建的**(admin 例外,看全部)
2. **管理员能创建/禁用/删除其他用户**,删除时被删用户的链接会**自动转移**给操作者
3. **短链跳转完全公开**(给客户用),但 dashboard 后台需要登录

## 紧急访问入口

如果哪天 owen 用户损坏 / 忘记密码 / 系统鉴权崩了:

- 在 Cloudflare 项目 → 设置 → 变量和密钥 看 `NUXT_SITE_TOKEN` 的值
- 用这个 token 登录(在登录页选"改用 token 登录"),会以虚拟 admin 身份进入
- 进入后立刻通过用户管理重置密码

详见 [operations.md](./operations.md) 的"紧急访问"章节。