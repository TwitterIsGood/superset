# Design

## Current State

`packages/db/src/client.ts` 使用 `@neondatabase/serverless`：

- `db` 通过 `drizzle-orm/neon-http` 创建。
- `dbWs` 通过 `drizzle-orm/neon-serverless` 和 `Pool` 创建。
- 本地/线上 Docker 的 `DATABASE_URL` 指向 `local-neon-http-proxy`，再由 proxy 转发到 Postgres。

这让线上服务多运行一个 814MB 左右的 `local-neon-http-proxy` 镜像，并且 DB 链路变成 API -> Neon proxy -> Postgres。

## Target State

`packages/db` 使用 `pg` + `drizzle-orm/node-postgres`：

- 创建一个 Node Postgres `Pool`。
- 使用同一个 Drizzle database 实例同时导出为 `db` 和 `dbWs`，保持调用方 API 不变。
- `DATABASE_URL` 和 `DATABASE_URL_UNPOOLED` 都指向 Postgres。

线上 compose：

- 删除 `neon-proxy` service。
- 删除 API 对 `neon-proxy` 的 `depends_on`。
- 保留 `postgres`、`electric`、`redis`、`kv-rest`、`minio`、`api`、`web`、`relay`、`electric-proxy`。

dev/worktree：

- 保留 `LOCAL_NEON_PROXY_PORT` 一轮兼容时可以作为旧 env 清理 key，但不再生成或依赖它。
- `DATABASE_URL` 直接使用 `LOCAL_PG_PORT`。
- 数据服务 readiness 不再检查 Neon proxy。

## Compatibility

- 前端 public env 不变：`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_ELECTRIC_URL`、`NEXT_PUBLIC_RELAY_URL` 不变。
- Electric raw service 仍使用 Postgres logical replication，要求 Postgres 保持 `wal_level=logical` 等配置。
- 写接口返回 txid 的逻辑依赖 `getCurrentTxid`，仍通过 Postgres transaction 执行 `pg_current_xact_id()` 或现有 SQL。

## Rollback

若 node-postgres driver 暴露不可接受的兼容问题：

- 恢复 `packages/db/src/client.ts` 到 Neon driver。
- 恢复 compose 中 `neon-proxy` service。
- 恢复 online/dev scripts 的 Neon proxy URL 和探活。

此任务不改 schema，因此 rollback 不涉及数据迁移。
