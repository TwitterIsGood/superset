# Phase 07 Principles and Standards

## Primary principle

External surfaces must be thin access layers over the same Agentic Work OS primitives.

## MCP standards

### Return durable IDs

Every creation tool should return IDs:

- intakeId;
- planId;
- taskIds;
- runId;
- agentRunIds;
- reviewPacketId.

### Long-running work returns operation/run IDs

Do not block until agents finish.

### Tools should be workflow-aware

Existing tools create tasks/workspaces/sessions. New tools should expose higher-level operations:

- create plan;
- run plan;
- get review packet;
- get timeline.

### Avoid duplicate invariants

MCP tools should call shared services used by UI/API where possible.

## Automation standards

### Automation is not just scheduled prompt dispatch

Automation should eventually produce durable results and review packets.

### Automations must be explainable

Every automation run should answer:

- why it ran;
- what it did;
- which workspace/agent;
- result;
- next required human decision.

### Completion matters

`dispatched` is not success. Future automation runs should track completion/result.

## Web standards

### Web can monitor before it executes

Do not rush web into local agent session creation if host/device execution lifecycle is not mature.

### Web approvals are high-value

Good first web actions:

- approve plan;
- approve risky command;
- approve memory;
- request fix;
- view review packet.

## Mobile standards

### Mobile is decision surface, not workbench

Mobile should focus on:

- notifications;
- approvals;
- summaries;
- run status.

Do not build complex workspace management first.

## API standards

### Operation status endpoint/tool

Every async operation should be queryable.

### Cancellation

Long-running runs should support cancellation where backend/runner permits.

### Auth and device ownership

Reuse existing org/device/host access checks.

## Anti-patterns

Avoid:

- MCP tools that block on full agent completion;
- duplicating task creation validation in every surface;
- making automation a separate product model from runs;
- enabling web/mobile actions that cannot be audited;
- remote execution without clear host/device ownership.

## Review checklist

- [ ] Tool outputs include durable IDs.
- [ ] Long work is async.
- [ ] MCP/API/UI use shared services.
- [ ] Automation result is not just dispatched.
- [ ] Web/mobile start with monitoring/approval.
- [ ] Auth/device checks are explicit.
