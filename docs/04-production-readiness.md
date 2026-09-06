# Production readiness

This checklist describes what must change or be verified before Rally is deployed for real users. It intentionally does not change the local-development setup: local Postgres, SMTP, filesystem attachments, and manually configured environment variables remain appropriate for development.

## Required before production

### Runtime and deployment

- Choose a deployment target that supports the Next.js version and runtime modes used by the application.
- Set `APP_URL` to the canonical HTTPS public URL. Ensure Auth.js uses the same origin and that redirect and invite URLs are tested there.
- Store all secrets in the deployment platform’s encrypted environment store; never put them in source control or client-visible environment variables.
- Set a strong, unique `AUTH_SECRET`, database credentials, SMTP credentials, and `CRON_SECRET`.
- Restrict the due-notification cron endpoint with `CRON_SECRET`; a production deployment must not leave it callable by the public internet.
- Define an owner-bootstrap procedure. `SEED_OWNER_EMAIL` is useful for initial setup, but the team must decide when it is removed or disabled after the owner is established.

### Database

- Use managed Postgres or an equivalently operated Postgres service with TLS, private credentials, automated backups, point-in-time recovery where available, and a documented restore procedure.
- Apply Prisma migrations as a controlled deployment step. Do not use development migration commands against the production database.
- Verify connection limits and pooling for the selected host and deployment runtime.
- Perform a restore rehearsal against a non-production database before launch.

### Attachments

The current attachment adapter writes to the application filesystem. It is correct for one local process, but is not durable across deployments and is unsafe for multi-instance or serverless production runtimes.

- Replace it with an object-store adapter (S3-compatible storage is sufficient).
- Use server-generated object keys, preserve the existing file-size limit, and validate allowed content types before storage.
- Serve downloads through authorization-aware application endpoints or signed, short-lived URLs; objects must not become publicly enumerable.
- Set lifecycle, retention, backup, and deletion policies that match the team’s client and legal obligations.

### Email and Slack

- Use a real transactional email provider with a verified sending domain, SPF/DKIM/DMARC, rate limits, and a monitored sender address.
- Configure a production Slack webhook through encrypted configuration and define who may change it.
- Treat notification delivery as best effort unless delivery status, retries, and a dead-letter process are explicitly implemented. A failed email or Slack call must not roll back the user’s task or chat action.

### Security and access

- Audit every mutation and download route against the access-control rules in the architecture document, particularly guest list scoping and cross-workspace ID access.
- Establish password requirements, account recovery expectations, and a process for revoking user access, invites, and exposed credentials.
- Enforce HTTPS, set an appropriate content-security policy and security headers, and review cookie/session settings for the deployed domain.
- Log security-relevant events: invite creation/revocation/acceptance, role and space-membership changes, attachment access, and administrative configuration changes. Avoid logging passwords, session tokens, invite tokens, or webhook URLs.

### Operations

- Configure error tracking and uptime monitoring before launch.
- Capture structured server logs with a request/correlation identifier and retain them long enough to investigate incidents.
- Monitor database health, cron execution, failed notification deliveries, and storage errors.
- Write a short incident runbook: how to roll back an app deployment, restore the database, rotate secrets, disable a compromised user, and communicate an outage.
- Name an owner for backups, secret rotation, dependency updates, and incident response.

## Recommended launch rehearsal

Before inviting real users, run this in a production-like environment:

1. Create an owner through the supported bootstrap path and verify invite-only onboarding.
2. Invite an Admin, Member, and Guest; confirm each sees only their intended spaces, lists, tasks, chat, and attachments.
3. Upload, download, and delete an attachment after a fresh deployment.
4. Verify password login, email delivery, Slack delivery, and protected cron execution.
5. Restore a backup into an isolated database and confirm the application can start against it.
6. Exercise the rollback and secret-rotation procedures.

## Deferred for now

CI, high availability, realtime infrastructure, background job queues, and formal service-level objectives are intentionally not prerequisites for the current local development phase. Reassess them when usage, deployment frequency, or notification volume makes the current approach insufficient.
