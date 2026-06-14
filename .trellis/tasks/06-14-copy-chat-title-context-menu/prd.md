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
- Desktop Automation CLI acceptance is not planned because the behavior is
  covered by focused helper tests plus existing context menu wiring in a single
  renderer component. Full Electron startup would mainly validate Radix menu
  behavior that is already provided by `@superset/ui/context-menu`.

## Validation

- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardChatSidebar/utils/resolveCopyableChatTitle/resolveCopyableChatTitle.test.ts`
- `bun run --cwd apps/desktop typecheck`
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/06-14-copy-chat-title-context-menu`
- `bun run lint`
- `DESKTOP_AUTOMATION_PORT=9435 bun run desktop:automation -- smoke --url-includes '#/sign-in' --screenshot .trellis/tasks/06-14-copy-chat-title-context-menu/artifacts/startup-sign-in.png --report .trellis/tasks/06-14-copy-chat-title-context-menu/artifacts/startup-sign-in.json --json`
