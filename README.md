# CloudDock

CloudDock is a multi-service hosting platform with one customer account and a unified control panel.

## Product scope

- **Bot hosting:** Discord, Nerimity, Fluxer, and Stoat; Node.js and Python runtimes.
- **Minecraft hosting:** planned server software/version selection, console, files, scheduled tasks, backups, databases, and subusers.
- **Web hosting:** planned websites/domains, file manager, databases, and backups.
- **Customer account:** Supabase email/password sign-up, login, email verification, password recovery, and account-owned services.
- **Control panel:** service lifecycle requests, source uploads, encrypted environment variables, deployment jobs, and service events.

## What is implemented

- Public storefront and customer dashboard.
- Supabase authentication and user-owned service metadata.
- SQL control-plane schema with RLS, starter quotas, private source storage, encrypted secret records, worker registry, and an atomic job-claim function.
- Supabase Edge Function API for customer service creation, service actions, source-upload URLs, environment secrets, worker registration/heartbeat/job claiming/completion.
- Reference worker agent for **Node.js and Python bot containers** with per-container memory/CPU/PID limits, non-root user, read-only root filesystem, dropped capabilities, no-new-privileges, and no published ports.
- Dashboard service cards wired to create services, upload ZIPs, queue deploy/start/stop/restart operations, and save encrypted environment variables.

## Not live / not yet implemented

- No CloudDock worker is provisioned by this repository. Real deployments will remain queued until an operator deploys a worker and configures its secrets.
- The current worker runs bot services only. Minecraft and website workloads are represented in the product catalogue/schema but are not provisioned yet.
- No reverse proxy, public service ports, live console/log streaming, interactive file manager, SFTP, backup scheduler, database provisioning, domain automation, billing, invoices, or support system yet.
- The worker now runs stale-job reconciliation: workers missing heartbeats are marked offline, abandoned jobs are retried up to three attempts, and exhausted jobs are marked failed for operator review. This is basic recovery, not high availability or capacity-aware scheduling.\n- Customer controls now include service deletion (blocked while jobs are active), secret-name listing/removal, and access to service events and deployment history. Secret values are never returned by the API.\n- Multi-worker capacity reservation, usage metering, production alerting, live console streaming, backups, databases, billing, and support workflows still need work.
- Do not advertise paid plans, uptime guarantees, or live server locations until the infrastructure and operations are actually ready.

## Supabase setup

1. Create a Supabase project.
2. Set the project URL and publishable/anon key in `assets/js/config.js`. Never put a service-role key in browser code.
3. Run migrations in order: `0001_accounts_and_apps.sql`, `0002_hosting_control_plane.sql`, then `0003_worker_recovery.sql`.
4. Deploy `supabase/functions/control-plane` with the Supabase CLI or Dashboard.
5. Set Edge Function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUDDOCK_WORKER_TOKEN` — at least 32 random characters.
   - `CLOUDDOCK_SECRETS_ENCRYPTION_KEY` — base64 encoding of exactly 32 random bytes.
6. The function config disables platform JWT verification because it verifies customer access tokens itself and authenticates workers with a separate shared token. Do not remove the function's own checks.
7. In Supabase Auth URL Configuration, set the Site URL to the deployed CloudDock URL and add it to Redirect URLs.

Example commands (from a trusted development environment with the Supabase CLI configured):

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy control-plane --no-verify-jwt
supabase secrets set CLOUDDOCK_WORKER_TOKEN="YOUR_LONG_RANDOM_TOKEN"
supabase secrets set CLOUDDOCK_SECRETS_ENCRYPTION_KEY="BASE64_32_BYTE_KEY"
```

Supabase provides its own project URL and service-role key in the Edge Function environment in hosted projects; confirm the variables are present before deployment. Never expose the service-role key to the browser or worker containers.

## Worker deployment

See [worker/README.md](worker/README.md). Run workers only on dedicated Linux VMs. The worker requires Docker socket access, which is effectively host-admin access. Do not run it on a personal computer or a host with private data.

The worker's bot runtime currently expects a ZIP containing `index.js` for Node.js or `main.py` for Python at the archive root. Optional `package.json`, `package-lock.json`, and `requirements.txt` are supported. Set required bot credentials in the service card's Environment action; values are encrypted by the control plane and injected into the workload without being written to logs.

Before accepting public workloads, configure host firewall rules to block customer access to host management ports, private LAN ranges, metadata endpoints, Docker APIs, and other tenant networks. The worker bridge disables inter-container communication, but that alone is not a complete network security boundary.

## Architecture

```text
Customer browser ── Supabase Auth ── Control-plane Edge Function
                                           │
                              Postgres / private Storage
                                           │
                                   Durable job queue
                                           │
                               Dedicated worker VM(s)
                                           │
                              Isolated bot containers
```

GitHub Pages serves only the frontend. Persistent workloads run on separately provisioned worker infrastructure.