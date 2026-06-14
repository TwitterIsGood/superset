# Copy chat title context menu

## Goal

Improve the desktop Chat sidebar context menu so users can copy a useful chat
title from the left conversation list without opening or selecting text.

## Requirements

- In the desktop dashboard Chat sidebar, right-clicking a conversation shows a
  context menu item labeled `复制会话标题`.
- Selecting the item copies the conversation title to the clipboard.
- If the stored title is empty or resolves to `New Chat`, copy the first user
  message text truncated to 30 characters instead.
- If no usable title or first user message text is available, preserve the
  existing display fallback and copy `New Chat`.
- Show a lightweight success toast after a successful copy.
- Reuse the existing renderer clipboard helper and chat runtime IPC client.

## Acceptance Criteria

- [x] The context menu item appears for each Chat sidebar conversation with the
      label `复制会话标题`.
- [x] A non-empty custom title copies directly.
- [x] Empty and `New Chat` titles copy the first user message's first 30
      characters when that message is locally available.
- [x] Copy failures still surface an error toast.
- [x] Focused desktop renderer tests/lint pass.
- [x] Root lint passes before push.

## Notes

- This is a lightweight renderer-only change, so PRD-only planning is enough.
- Desktop Automation CLI acceptance was added after implementation to verify
  the menu from an authenticated desktop Chat session, not only from the sign-in
  route.

## Validation

- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardChatSidebar/utils/resolveCopyableChatTitle/resolveCopyableChatTitle.test.ts`
- `bun run --cwd apps/desktop typecheck`
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/06-14-copy-chat-title-context-menu`
- `bun run lint`
- `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- smoke --url-includes '#/sign-in' --screenshot .trellis/tasks/06-14-copy-chat-title-context-menu/artifacts/startup-sign-in.png --report .trellis/tasks/06-14-copy-chat-title-context-menu/artifacts/startup-sign-in.json --json`
- Authenticated desktop smoke with isolated Electron env (`DESKTOP_VITE_PORT=3135`,
  `DESKTOP_AUTOMATION_PORT=9435`, temp `SUPERSET_HOME_DIR`, local API token):
  - Reached `http://localhost:3135/#/chat` after login token bootstrap.
  - `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- wait-for --text '复制会话标题' --timeout-ms 5000 --json`
  - `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- click --text '复制会话标题' --json`
  - `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- wait-for --text '已复制会话标题' --timeout-ms 5000 --json`
  - `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- evaluate-js --code 'navigator.clipboard.readText()' --json`
  - `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- console-logs --level error --json`
  - Artifacts: `artifacts/chat-authenticated.png`,
    `artifacts/chat-context-menu-authenticated.png`.
