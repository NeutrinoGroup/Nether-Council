# ADR 0008 — Supabase PostgreSQL + Python，三张宽表

2026-11-01。状态：设计与本地集成验证完成，尚未连接生产数据源。

用户要求只保留 `calls`、`cache`、`outbox` 三张应用表。现有 Next.js / Vercel / Qwen WebSocket 音频路径继续工作；Python 负责持久化和异步事件，不把实时音频绕经 Python 或数据库。首轮不引入用户、消息、角色、附件、任务等额外表。角色静态资料继续使用版本库。

| 表 | 粒度和主键 | 宽字段与用途 | 保留策略 |
|---|---|---|---|
| `nether.calls` | 一次会话 / `id` UUID | 活动、来源会话、角色、语言、模式、阶段时间、完成状态、故事轮数、插话数、保存/分享次数、五类延迟和修订号 | 默认 7 天；只清理完成且无未处理事件的记录 |
| `nether.cache` | 命名空间 + 不含正文的 key + version | 模型、call_id、JSON 结果、有效期和更新时间；模型/版本不匹配即 miss | 身份结果最多 24 小时，公共资源最多 7 天；读取严格检查过期 |
| `nether.outbox` | 一次待分发事件 / UUID；event_key 唯一 | call_id、事件类型、白名单 payload、状态、尝试次数、下次执行时间、租约 token/期限、错误码 | 完成/死信默认保留 7 天；待处理事件不自动删除 |

`calls` 中尚无来源的指标保持 NULL 或默认值，不伪造数据。`card_save_count` 仅对应实际生成下载文件事件；`share_invoked` 表示唤起分享，不代表平台发布成功；朋友真正开始对话使用已验签的 `source_session_id`。匿名入口浏览、点击下载和故事正文不进入 outbox。漏斗使用各阶段非空的会话数，避免重复事件造成虚假转化。

## 边界与一致性

迁移由 Supabase CLI 创建于 `supabase/migrations/20261101050233_halloween_wide_tables.sql`，总计三张应用表。全部放在非公开 `nether` schema 并启用 RLS。保持该 schema 不在 Data API exposed schemas 中，撤销 PUBLIC 权限；浏览器 anon/authenticated 无表授权或策略。不将 service_role、数据库密码、Qwen 密钥或任何 `DATABASE_URL` 放进 `NEXT_PUBLIC_*`。

Python `Store.record()` 在一个事务中写 calls 和 outbox：唯一 event_key 防重复，call 身份不可重新分配，任一步失败全部回滚。来源、活动、会话 ID 及字符语言由已验签的服务端会话产生，不能直接信任网页请求。`Store` 是内部库，不是开放 HTTP 接口。

Worker 使用 `FOR UPDATE SKIP LOCKED` 并发领取、有限租约和 fencing token；过期 worker 不能 ack/retry 新 worker 的任务。失败指数退避，最多五次，最后一次 worker 崩溃也会进入 dead。交付语义是 **at least once**：下游必须以 event_key 去重；不得声称 exactly once。默认一次只领取一个事件，处理器必须设置小于 30 秒的超时；长任务应另设续租方案后再上线。数据库事务不包住远程网络调用。

cache 只接收必要结果 JSON；key 使用 call UUID 或服务端 HMAC，不用故事/昵称。禁止存音频、完整字幕、原始故事、密钥、用户 IP、UA 指纹和第三方异常正文。身份结果可能含故事线索，不能当公共缓存。公共分享仍由用户自己的身份卡控制。

## Python 与连接

`services/data` 使用 Python 3.12+、psycopg3 和 `uv.lock`。依赖以锁文件固定。连接禁止持久 prepared statements，兼容 Supavisor transaction pooler；持续 worker 优先 direct/session pooler。生产 DSN 使用 TLS `sslmode=verify-full` 与平台 CA；密钥由部署平台注入，日志不打印 DSN。存储时间全部为 UTC timestamptz。

初次迁移使用数据库管理员连接。运行服务使用仅授权 `nether` 的独立服务角色，并为该可信后端角色配置表权限与 RLS 策略，或使用平台 server-only service role。不要把管理员连接借给前端。迁移当前没有新建密码或自动配置线上权限。

```bash
uv sync --project services/data --frozen
# 本机一次性 PostgreSQL；测试另建随机名称 UTF-8 数据库并在结束后删除。
NETHER_TEST_DATABASE_URL='postgresql://localhost:55432/postgres?sslmode=disable' \
  uv run --project services/data --frozen pytest services/data/tests -q
```

```python
from uuid import uuid4
from nether_data.store import Call, Store
# dsn 从服务端环境注入；session/source 来自验签后的 claims。
store = Store(dsn)
store.record(Call(session.id, campaign.id, session.character_id, session.locale,
                  session.mode, source_session_id), event_id, "conversation_started")
# worker：handler(event_key, event_type, payload)，外部副作用按 event_key 去重。
store.dispatch(handler)
```

## 上线接线点

本轮交付 **可执行迁移、Python 内部库和真实 PostgreSQL 测试**，不是宣称已上线的持久化服务。当前网页 `/api/events` 仍使用既有服务端遥测日志。接线时让该受保护入口调用部署后的 Python 私有 ingestion；没有浏览器直连数据库。音频不可等待该请求，数据失败只影响观测。

上线前需确认 Nether 专用 Supabase 项目及 Python 服务部署位置，再配置服务身份、迁移、私有请求认证、限时及健康检查。当前连接器只发现非 Nether 命名的共享项目，因此本轮未修改线上数据库或新建计费项目。已有 Vercel 平台环境变量保持使用，不覆盖本机 `.env`。

保留任务每小时按过期时间分批删除 cache；每日报表后清理七日前 done/dead outbox，再清理七日前已结束且无 pending/processing outbox 的 calls。FK cascade 同步移除其结果缓存。生产启用定时清理前先确认活动运营的数据保留要求。

## 验证与文档依据

真实 PostgreSQL 测试覆盖三表数量、RLS、事务回滚、重复事件、身份不可变、模型/版本/TTL miss、并发 worker、租约过期 fencing、重试退避、死信和延迟乱序事件。测试拒绝非 loopback 数据库，避免误改 Supabase。CI 使用独立 PostgreSQL service。

核对了 Supabase 当前 [连接文档](https://supabase.com/docs/guides/database/connecting-to-postgres)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) 与 [changelog](https://supabase.com/changelog)：TLS CBC 弃用、PG libc/ICU 索引变更不要求本方案改写；新连接使用现代 TLS，索引使用 UUID 和确定的标识字段。未对共享项目执行版本升级。
