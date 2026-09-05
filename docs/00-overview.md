# Overview

## Name

The project is called **Rally**.

## What we are building

An internal work management tool for the organisation, similar in spirit to ClickUp, scoped to what the team actually uses day to day instead of the full ClickUp feature set.

## Who uses it

- Internal team members: small team, full access to their workspace
- External clients: guest access, restricted to specific lists/tasks shared with them

## Why not just use ClickUp

Out of scope for this doc. Assume the decision is made and we are building a focused, self hosted alternative.

## Goals

- Replace ClickUp for task and sprint tracking
- Keep client collaboration working (guest access to specific work)
- Native in-app chat, not a Slack replacement but not dependent on Slack either
- Mobile friendly from day one (responsive web, not a native app in v1)
- Small enough surface area that one team can maintain it

## Non-goals (for now)

- Feature parity with ClickUp
- Native iOS/Android apps
- Building a whiteboard, mind map, or wiki/docs product
- Replacing Slack entirely

## Document map

- [Features](01-features.md): what is in scope, phased, and what is deliberately cut
- [Architecture](02-architecture.md): tech stack, data model, system diagram
- [Roadmap](03-roadmap.md): build order and open questions
