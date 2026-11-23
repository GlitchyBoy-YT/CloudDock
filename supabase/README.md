# Supabase setup notes

CloudDock's initial schema is in `migrations/0001_initial_schema.sql`.

## Current scope

The migrations create:
- `profiles` — a customer's own profile row.
- `service_requests` — requests for a planned hosting service; these are not running instances.
- `service_events` — read-only customer-visible timeline entries.
- An Auth trigger that automatically creates a profile row for each new account (migration `0002_auth_profile_trigger.sql`).

Row-level security is enabled. Customers can read and edit only their own profile, submit and view only their own service requests, and read events belonging to their own requests. Customers cannot approve requests or write activity events.

## Apply the migration

1. Create a Supabase project for CloudDock.
2. Open the project's SQL Editor.
3. Review and run `migrations/0001_initial_schema.sql`.
4. Review and run `migrations/0002_auth_profile_trigger.sql`.
5. Verify the tables and their row-level security policies in the Table Editor.
6. Follow `AUTH_SETUP.md` to configure authentication and the public frontend key.
7. Keep the project's service-role key private. It must never be added to this public GitHub Pages repository or browser JavaScript.

## Frontend configuration (when authentication is added)

The browser may use only the Supabase project URL and publishable/anon key. These values are designed for client use when row-level security is correctly configured. They are not substitutes for authorization: every table must have restrictive policies, and privileged actions must run in a trusted server-side environment.

Do not commit project secrets. Do not add a real key to an example file. Authentication UI and server-side request processing have not yet been connected.

## Important limitation

This database foundation records customer requests. It does not create servers, deploy websites, start bots, allocate VPS instances, or monitor infrastructure. Those capabilities require a separate trusted provisioning service and compute provider integration.
