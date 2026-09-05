# Features

Scope is split into Phase 1 (MVP, needed to actually replace ClickUp) and Phase 2 (fast follow). Anything not listed is cut, see the bottom of this doc for cuts and why.

## Roles

| Role | Access |
|---|---|
| Owner | Full control, sees every space, only one per workspace, bootstrapped from `SEED_OWNER_EMAIL` in `.env` (not signup, no password in env) |
| Admin | Invites Members/Guests, but only into the specific spaces they're assigned to manage (`SpaceMember`) — not workspace-wide |
| Member | Create/edit tasks and lists, comment, chat — scoped to the specific spaces they've been added to |
| Guest | Restricted to specific lists/tasks shared with them, comment only, no visibility into the rest of the workspace |

Guest access is a first class concern, not an afterthought, because clients need it.

Onboarding is invite-only, no public signup. On server start, `src/instrumentation.ts` checks whether `SEED_OWNER_EMAIL` is already registered as the workspace Owner; if not, it creates an `Invite` for that email (emailed, and logged to the server console) the same way any other invite works. The Owner invites Admins; Admins invite Members (into spaces they manage) and Guests (into lists they can edit). An `Invite` row holds a token, target role, and target space/list; accepting it only sets the person's password and creates their account — it never signs them in, it sends them to `/login`. Someone already in the workspace is never re-invited; the Owner changes their role (Admin/Member) directly instead.

## Phase 1: MVP

### Task and project tracking

- Workspace -> Space -> List -> Task hierarchy
- Subtasks, checklists, custom fields (text, number, date, dropdown)
- Task detail: assignees, priority, due date, comments, attachments, dependencies
- Views: Board (kanban), List, Sprint/Backlog

Sprint/Backlog is a List with a start date, end date, and a simple burndown count. Not a separate subsystem.

### Chat

- Channels (per space or standalone) and direct messages
- Threaded replies
- Task references: link a task or paste a task link that unfurls into a card
- Real in-app chat, not a Slack passthrough

### Notifications

- In-app notification center
- Email notifications (task assigned, due soon, mentioned, comment reply)
- Slack notifications, optional per workspace, pushes events to a chosen channel

### Access and platform

- Auth with the four roles above
- Guest access scoped to specific lists/tasks via share links
- Responsive web UI, works on phone/tablet browsers, installable as a PWA
- Search across tasks, comments, and chat within a workspace

## Phase 2: fast follow

### Automations

Trigger -> action rules, not a visual builder. Cover the common cases:

- Status changes to X -> assign to Y
- Due date passes -> notify assignee
- Task created in list X -> apply template/checklist

### AI features

Bolt-on to existing task/chat data via the Claude API, not a separate AI product:

- Summarize a task's comment thread
- Generate subtasks from a task description
- Draft a reply in chat

### Reporting

- Time tracking (start/stop timer per task, manual entry)
- A handful of dashboard widgets: tasks by status, overdue count, time by project

## Cut, and why

| Feature | Why cut |
|---|---|
| Whiteboards | Not part of the team's actual workflow today |
| Mind maps | Same as above |
| Docs/wiki | Adds a second content type and editor to maintain, revisit if actually needed |
| Goals/OKRs | Nice to have, not blocking day to day work |
| Native mobile apps | Responsive web + PWA covers "mobile friendly" without app store overhead |
| Building chat presence/read receipts in v1 | Real scope, deferred to keep v1 shippable, see [Roadmap](03-roadmap.md) |

If any of these become a real blocker later, add them as their own phase, do not fold them into Phase 1 or 2.
