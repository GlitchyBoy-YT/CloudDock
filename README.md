# CloudDock

CloudDock is an account-based control panel foundation for a multi-platform bot hosting service supporting **Discord, Nerimity, Fluxer, and Stoat**.

## Included in this release

- Supabase email/password sign-up and login
- Email verification flow (when enabled in Supabase Auth)
- Password reset email flow
- Protected dashboard; signed-out visitors see the authentication screen
- Supabase session persistence and sign-out
- User-owned application records stored in Postgres
- Row Level Security (RLS) so users can only access their own application records
- Application creation persisted to the signed-in user's account

## Setup

### 1. Create a Supabase project

Create a project in Supabase, then open **Project Settings → API** and copy:
- Project URL
- Publishable key (or legacy anon key)

Put those values in `assets/js/config.js`:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
```

The publishable/anon key is intended for browser use. **Never use the service_role key in frontend code or commit it to GitHub.**

### 2. Create the database tables and security policies

Open **SQL Editor** in Supabase and run the complete file:

`supabase/migrations/0001_accounts_and_apps.sql`

This creates user profiles, application records, ownership constraints, and Row Level Security policies. Each app is owned by the authenticated user who created it.

### 3. Configure Supabase Auth

In **Authentication → URL Configuration**:
- Set the Site URL to your published CloudDock URL.
- Add the exact CloudDock URL to the Redirect URLs allow-list.
- Enable email confirmations if you want verified email addresses before login.
- Configure your email provider / SMTP for reliable verification and password-reset delivery.

For local testing, add your local development URL to the redirect allow-list too.

### 4. Publish the dashboard

CloudDock is a static frontend and can be published using GitHub Pages:
1. Open repository **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose `main` and `/ (root)`, then save.

GitHub Pages only serves the dashboard. It does not run bots or backend workers.

## Hosting architecture still required

This repository now has real authentication and persistent per-user application metadata. It does **not yet execute customer bot code**. A production host still needs a separately deployed control API, job queue, encrypted secret store, and isolated worker fleet:

```text
Dashboard (GitHub Pages)
       │ Supabase Auth session
       ▼
Control API ─── Postgres + encrypted secret store
       │
       ▼
Job queue / scheduler
       │
       ▼
Isolated worker containers (one workload per sandbox)
       ├── Discord adapter
       ├── Nerimity adapter
       ├── Fluxer adapter
       └── Stoat adapter
```

Workers must enforce CPU, memory, process, storage, network, and time limits. Never execute uploaded code in the control API process. Bot credentials must be encrypted server-side and delivered only to the authorized worker at runtime.

## Current deployment limitations

- Starting/stopping apps is not wired to a worker runtime yet.
- CPU, memory, logs, and uptime views are not live telemetry yet.
- Billing, team invitations, and multi-user workspaces are not connected.
- No bot token is requested by this frontend yet; credential storage should be added only through a server-side encrypted-secret API.

## License

MIT. See [LICENSE](LICENSE).
