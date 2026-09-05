# Rally

Rally is a work management app for the team: workspaces, spaces, lists, tasks, sprints, chat, and invite based access control. It's built on Next.js, Prisma, and Postgres, with authentication handled by NextAuth.

There is no public signup. The very first user (the Owner) is created automatically the first time the server starts, based on an email address you set in your environment. Every other user is added by invite: an Owner invites Admins, and Admins invite Members and Guests into the specific spaces they manage.

## Requirements

- Node.js 20.19 or newer
- A running Postgres server
- npm

## 1. Install dependencies

```bash
npm install
```

This also runs `prisma generate` automatically via the `postinstall` script.

## 2. Set up Postgres

You need a Postgres database and a user that can connect to it. If you don't already have Postgres running locally, install it (`brew install postgresql` on macOS, or run it in a container) and start it.

Then create a database and user matching what the app expects. From a `psql` shell as a superuser:

```sql
CREATE USER rally WITH PASSWORD 'rally_dev_password';
CREATE DATABASE rally_dev OWNER rally;
```

You can use different values, just make sure they match the `DATABASE_URL` you set in your `.env` file in the next step.

## 3. Configure environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Variables you need to set:

- `DATABASE_URL`, your Postgres connection string, matching whatever you created in step 2.
- `APP_URL`, the base URL the app runs at, `http://localhost:3000` for local development.
- `AUTH_SECRET`, a random secret used by NextAuth to sign sessions. Generate one with `openssl rand -base64 32`.
- `EMAIL_SERVER` and `EMAIL_FROM`, SMTP settings used to send magic link and invite emails. See the email section below for local development.
- `SEED_OWNER_EMAIL`, the email address that should become the workspace Owner. On first server start, if no Owner exists yet, an invite is created and sent to this address so they can set a password and log in.

## 4. Run database migrations

```bash
npm run db:migrate
```

This creates all the tables the app needs. No seed data is created, the database starts empty except for whatever the app itself creates on first run.

## 5. Start the app

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

On the very first run, the server will notice there's no Owner yet and create an invite for `SEED_OWNER_EMAIL`. It logs the invite link to the terminal and also tries to email it. Open that link, set a password, and you'll be redirected to the login page to sign in as the Owner.

## Testing the email server locally

Real email delivery needs a real SMTP provider, which you probably don't have set up in local development. Instead, run a local SMTP catcher so you can see what the app would send without actually emailing anyone.

[MailDev](https://github.com/maildev/maildev) works well for this and needs no setup beyond running it:

```bash
npx maildev
```

By default MailDev listens for SMTP on port 1025 and serves a web inbox at `http://localhost:1080`. This matches the default `EMAIL_SERVER` value in `.env.example`, so as long as MailDev is running before you trigger an invite, a magic link login, or the owner bootstrap invite, you can open `http://localhost:1080` in your browser and read the email there instead of checking a real inbox.

If you don't run MailDev (or any SMTP server) locally, invite and login emails will simply fail to send, but the invite link is still logged to the terminal and shown in the app UI, so you can still copy and use it directly.

## Available scripts

- `npm run dev`, start the development server.
- `npm run build`, build the app for production.
- `npm run start`, run the production build.
- `npm run lint`, run ESLint.
- `npm run db:migrate`, run Prisma migrations against your database.
- `npm run db:studio`, open Prisma Studio, a GUI for browsing and editing your database.

## Resetting your local database

If you want to wipe your local database and start over with no users or data:

```bash
npx prisma migrate reset
```

This drops all data and reapplies every migration. The next time you start the app, it will bootstrap a fresh Owner invite for whatever `SEED_OWNER_EMAIL` is set to.
