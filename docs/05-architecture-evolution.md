# Architecture evolution

## Goal

Build Rally as a set of focused modules. Each module owns one area of behavior. Route files and Server Actions stay small. Client workflow modules stay independent from database code. Shared types stay outside client workflow files.

## Current module ownership

| Module | Owns |
| --- | --- |
| `src/lib/access.ts` | List and task authorization. |
| `src/lib/tasks.ts` | Task creation, fields, assignees, checklists, custom fields, dependencies, attachment records, deletion, and moves. |
| `src/lib/rally-app-data.ts` | Dashboard read queries, Prisma include shapes, and database-to-UI mapping. |
| `src/lib/rally-types.ts` | Shared dashboard view types. |
| `src/app/actions.ts` | Session lookup, framework adapters, route refresh, local attachment writes, notification delivery, and work outside extracted modules. |
| `src/app/components/primitives.tsx` | Shared avatar, pill, copy-button, markdown rendering, mention composer, and status constants. |
| `src/app/components/task-detail-header.tsx` | Task title, edit mode, copy link, delete, and close UI. |
| `src/app/components/task-assignees.tsx` | Task assignee display and edits. |
| `src/app/components/task-description.tsx` | Task description display and edit UI. |
| `src/app/components/task-checklist.tsx` | Task checklist display and edits. |
| `src/app/components/task-custom-fields.tsx` | Task custom field value display and edits. |
| `src/app/components/task-dependencies.tsx` | Task blocked-by/blocks display and edits. |
| `src/app/components/task-attachments.tsx` | Task attachment list, upload, and delete UI. |
| `src/app/components/task-comments.tsx` | Task comment list and composer UI. |

## Future module map

| Module | Interface | Owns |
| --- | --- | --- |
| `access.ts` | Require access to a workspace, space, list, task, or channel. | Role checks, membership checks, guest scope, cross-workspace checks. |
| `tasks.ts` | Create, update, move, and delete task work. | Task rules, task persistence, task validation. |
| `invites.ts` | Create, revoke, and accept invites. | Invite scope, expiry, account creation, membership creation. |
| `spaces.ts` | Create spaces and lists, manage members. | Space rules, list rules, member assignment. |
| `chat.ts` | Create direct channels, post messages, mark read state. | Channel membership, threads, message persistence. |
| `notifications.ts` | Record and deliver notifications. | Preferences, email delivery, Slack delivery, due-date work. |
| `profile.ts` | Update profile, password, and preferences. | Profile validation and persistence. |
| `rally-app-data.ts` | Load dashboard props for a viewer. | Read queries and view-model mapping. |
| `task-detail.tsx` | Render task detail workflow. | Task detail state and task detail UI. |
| `chat-workflow.tsx` | Render chat workflow. | Channel state, message state, chat UI. |
| `workspace-management.tsx` | Render space and member workflow. | Invite, space, list, and member UI state. |
| `settings-workflow.tsx` | Render profile and notification settings. | Settings UI state. |

## Delivery order

Done: task detail extraction (header, assignees, description, checklist, custom fields, dependencies, attachments, and comments now live in `src/app/components/task-*.tsx`).

1. Extract chat workflow from `RallyApp.tsx`.
2. Extract workspace management workflow from `RallyApp.tsx`.
3. Extract settings workflow from `RallyApp.tsx`.
4. Move invite and space work from `actions.ts` into `invites.ts` and `spaces.ts`.
5. Move chat work into `chat.ts`.
6. Move profile and notification work into `profile.ts` and `notifications.ts`.
7. Extend `access.ts` for spaces, channels, invites, and workspace roles.
8. Add local tests for access rules and task work.
9. Add input validation and one error contract for Server Actions.
10. Resolve the Turbopack build port-binding failure.

## Rules for future work

- Start with one vertical slice. Do not mix unrelated workflow changes in one change set.
- Put authorization beside domain work. Do not query membership tables from route files or client code.
- Keep Server Actions as framework adapters. Each action reads the session, calls one domain operation, refreshes the route, and returns a small result.
- Keep database queries inside server modules. Do not import Prisma into client workflow modules.
- Keep shared view types in `src/lib/rally-types.ts`.
- Keep local filesystem storage and SMTP for development. Follow the production readiness checklist before deployment.
- Add a local test whenever a module gains a security rule or multi-step workflow.
- Run `npm run lint`, `npx tsc --noEmit`, and `git diff --check` after each change set.
- Do not commit or push from agent work.

## Definition of done for one module

- One focused interface describes module behavior.
- One module owns authorization, validation, and persistence for its area.
- Server Actions contain no domain rules for extracted work.
- Client workflow files contain no Prisma imports.
- Local checks pass.
- Documentation records module ownership and user-visible behavior.
