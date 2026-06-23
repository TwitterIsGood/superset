# 治理移动端 Expo 环境与打包配置

## Goal

把 `apps/mobile` 的 Expo 环境、在线公网地址、ATS、EAS profile 和本地 unsigned IPA 打包入口收敛成同一套可验证配置契约，避免再出现“打包时缺 env 导致启动崩溃”“公网 HTTP 被 iOS ATS 拦截”“旧 `.env.local` 覆盖正确参数”“手工打包和 EAS profile 不一致”等问题。

## Requirements

- 移动端必须有显式 profile，不依赖 `NODE_ENV` 判断环境。至少覆盖：
  - `development` / worktree 本地开发
  - `online-canary` / 当前 Mac mini 在线服务：`http://bj1.v.lhb.ink:63000/63001/63012/63013`
  - `production` / 后续正式发布
- URL 配置必须集中解析和校验。API、Electric、Web、Relay 等核心 URL 必须必填；PostHog 等遥测/分析配置必须可选，缺失时禁用功能，不允许启动崩溃。
- App config、运行时 env、EAS profile、本地 unsigned IPA 打包脚本必须复用同一份移动端配置逻辑或同一份 profile 常量，避免散落在 `app.config.ts`、`.env.local`、`eas.json`、shell 脚本里的值互相漂移。
- iOS ATS 只允许经过明确批准的 HTTP 域名/本机开发地址。当前允许 `bj1.v.lhb.ink` 和 localhost/loopback；其他公网 HTTP 必须在打包前失败。
- 在线服务脚本写入 `apps/mobile/.env.local` 时只能替换受管的 Expo public URL/profile key，保留用户本地非受管配置，并且不能写入不该进入客户端 bundle 的 secret。
- 提供一个稳定的本地 unsigned IPA 打包入口，内置 preflight，支持代理下载依赖，输出路径固定，便于用户拿到另一台机器重签。
- 提供 smoke 检查，能在 CI/本地快速发现：
  - 缺少核心 URL
  - 可选 PostHog 缺失导致崩溃
  - `online-canary` 使用当前公网 HTTP 地址但 ATS 已放行
  - EAS profile 与 resolver profile 漂移
  - 构建产物 Info.plist 缺少必要 ATS 配置

## Acceptance Criteria

- [x] 缺少 `EXPO_PUBLIC_POSTHOG_KEY` 时，移动端启动配置解析通过，PostHog provider 不创建客户端，不崩溃。
- [x] 缺少 `EXPO_PUBLIC_API_URL` 等核心 URL 时，测试或 preflight 失败在打包前，而不是让 IPA 启动后崩溃。
- [x] `online-canary` profile 解析为 `http://bj1.v.lhb.ink:63000/63001/63012/63013`，并生成 iOS ATS 例外。
- [x] 除 localhost/loopback 和明确 allowlist 域名外，移动端拒绝公网 HTTP URL。
- [x] `apps/mobile/eas.json` 中的 build profile 与移动端 profile 名称/关键 URL 保持一致。
- [x] `scripts/superset-online.sh` 同步移动端 `.env.local` 时写入正确 profile 和公网 URL，并保留非受管 key。
- [x] 有命令可以本地打 unsigned IPA，并完成 plist/ATS smoke；输出路径清晰。
- [x] 验证通过：focused tests、`bun run --cwd apps/mobile typecheck`、`bun run lint`；若 root `typecheck` 因本机资源 SIGKILL，需要记录原因和已覆盖的替代验证。

## Notes

- 当前公网服务仍是 HTTP，不改成 HTTPS；iOS 通过 ATS allowlist 支持当前部署现实。
- 本任务允许清理移动端配置结构，不需要向后兼容旧的错误 `.env.local`。
- Validation on 2026-06-23:
  - `bun test apps/mobile/config/mobile-env.test.ts apps/mobile/lib/env.test.ts apps/mobile/screens/RootLayout/providers/PostHogProvider/PostHogProvider.test.ts apps/mobile/screens/RootLayout/RootLayout.test.ts scripts/dev-worktree.test.ts scripts/superset-online.test.ts`
  - `bun run --cwd apps/mobile typecheck`
  - `bun run lint`
  - `SUPERSET_MOBILE_PROFILE=online-canary EXPO_PUBLIC_SUPERSET_PROFILE=online-canary bunx expo config --json`
  - `HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 ALL_PROXY=socks5://127.0.0.1:7890 bun run --cwd apps/mobile build:ios:unsigned -- --profile online-canary --output-dir /tmp/superset-mobile-ipa`
  - `/usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSExceptionDomains:bj1.v.lhb.ink:NSExceptionAllowsInsecureHTTPLoads' /tmp/superset-mobile-ipa/Superset.xcarchive/Products/Applications/Superset.app/Info.plist`
  - `bun run typecheck` was attempted and terminated by SIGKILL before TypeScript diagnostics were emitted; mobile package typecheck covered the changed TypeScript surface.
