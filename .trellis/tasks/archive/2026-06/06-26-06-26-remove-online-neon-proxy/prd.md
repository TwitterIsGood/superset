# 移除线上 Neon proxy 兼容层

## Goal

让 Superset 的在线 Docker 服务和本地/worktree 开发环境通过 Drizzle 直接连接 Postgres，不再依赖 `local-neon-http-proxy` 兼容 Neon serverless HTTP/WS 协议。保持公网端口、前端配置、Electric 同步、Relay 和 Automation 行为不变。

## Requirements

- `packages/db` 的运行时客户端必须从 Neon serverless driver 切换为普通 Postgres driver。
- `db` 和 `dbWs` 导出必须继续支持现有调用方：
  - 常规 Drizzle query/select/insert/update/delete。
  - `.transaction(...)`。
  - `query.<table>.findFirst(...)`。
  - `getCurrentTxid(...)` 相关写后同步逻辑。
- 线上 Docker compose 不再启动 `neon-proxy` 容器，API/Web/Relay/Electric Proxy 仍使用原有公网端口：
  - Web `43000` / public `63000`
  - API `43001` / public `63001`
  - Electric Proxy `43012` / public `63012`
  - Relay `43013` / public `63013`
- `scripts/superset-online.sh` 不再生成或探活 Neon proxy 相关配置；数据库探活改为直接对 Postgres 执行 SQL。
- worktree/dev 环境生成的 `DATABASE_URL` 必须指向 Postgres 端口，不再指向 Neon proxy 端口；现有端口窗口应尽量保持稳定，避免引入新的端口冲突。
- Electric 继续保留，仍直连 Postgres 并通过 `electric-proxy` 暴露受鉴权的 shape API。
- 不修改数据库 schema，不创建 migration，不触碰生产数据。

## Acceptance Criteria

- [x] `packages/db/src/client.ts` 不再依赖 `@neondatabase/serverless` 或 local Neon proxy 配置。
- [x] `docker-compose.online.yml` 和 `docker-compose.yml` 不再定义 `neon-proxy` service。
- [x] `scripts/superset-online.sh status/start` 不再显示或等待 Neon proxy，但仍能验证 Postgres SQL、API、Web、Electric Proxy、Relay。
- [x] `scripts/dev-worktree.ts` 和相关测试不再生成 Neon proxy 数据库 URL。
- [x] `bun test scripts/superset-online.test.ts scripts/dev-worktree.test.ts scripts/worktree-local-shell.test.ts` 通过；`packages/db/src/*.test.ts` 当前没有匹配文件。
- [x] `bun run lint` 和 `bun run typecheck` 通过。
- [x] `./scripts/superset-online.sh start`/手动滚动应用容器后，线上 Docker 只保留必要服务，公网四个入口探活通过。
- [x] `docker ps` 不再出现 `superset-online-neon-proxy-*`。

## Out of Scope

- 不移除 Electric。
- 不重构前端 TanStack/Electric collection 层。
- 不改变公网域名、协议或端口映射。
- 不做数据库 schema/migration。
