# CloudDock

CloudDock is a multi-service hosting platform concept with one customer account and a unified control panel.

## Services in the product plan

- **Bot hosting:** Discord, Nerimity, Fluxer, and Stoat, with Node.js and Python runtimes.
- **Minecraft hosting:** server software/version selection, console, files, scheduled tasks, backups, databases, subusers, and optional subdomains.
- **Web hosting:** websites/domains, file manager, software installer, databases, and backups.
- **Customer account:** Supabase email/password sign-up, login, email verification, password recovery, and account-owned application records.
- **Unified panel roadmap:** console, file manager, SFTP, backups, databases, schedules, resource monitoring, team permissions, and billing.

The public website now presents these service categories and the intended control-panel features. Infrastructure-dependent features are described as planned, not as live services.

## Supabase setup

1. Create a Supabase project.
2. Copy the Project URL and publishable/anon key into `assets/js/config.js`.
3. Run `supabase/migrations/0001_accounts_and_apps.sql` in the Supabase SQL Editor.
4. In Supabase Authentication → URL Configuration, set the Site URL to the published CloudDock URL and add it to Redirect URLs.
5. Configure email delivery and enable email confirmations as desired.
6. Publish the static site using GitHub Pages (Settings → Pages → Deploy from a branch → `main` → root).

Never put the Supabase `service_role` key in browser code or GitHub. The publishable/anon key is expected to be public; Row Level Security (RLS) is the security boundary for user data.

## Production hosting architecture

GitHub Pages serves only the website. It cannot keep customer processes running. Actual hosting requires infrastructure outside this repository:

```text
CloudDock website
      │ Supabase Auth session
      ▼
Control API ───── Postgres + encrypted secrets
      │
      ▼
Provisioning queue / scheduler
      │
      ▼
Isolated worker nodes
      ├── Bot runtimes (Discord / Nerimity / Fluxer / Stoat)
      ├── Minecraft server containers
      └── Website hosting containers
```

The production control plane must enforce ownership checks on every operation. Customer workloads must run in isolated containers or VMs with CPU, memory, disk, process, network, and time limits. Secrets must be encrypted server-side and injected only into the authorized workload. Never execute uploaded customer code inside the API process.

## Current implementation status

- Public CloudDock marketing site and service catalogue.
- Supabase email/password sign-up, login, email verification, password recovery, and per-user application metadata (after Supabase setup).
- Dashboard UI: overview, applications, deployments, monitoring, usage, team, settings, and documentation.
- Real bot/game/web provisioning, live console, file transfer, SFTP, backups, databases, domain automation, resource telemetry, payment processing, and team invitations still require production APIs and infrastructure.
- Pricing and data-center locations are intentionally not advertised as live until CloudDock has real capacity and operational policies.

## Suggested next milestones

1. Provisioning API and isolated worker agent.
2. Bot deployment lifecycle and secure encrypted credential storage.
3. File manager, console streaming, logs, and resource telemetry.
4. Minecraft templates, version installer, databases, backups, and schedules.
5. Website deployment, domain/DNS integration, and certificates.
6. Billing, invoices, plan limits, and customer support workflow.