# CloudDock authentication setup

## 1. Create a Supabase project

Create a dedicated Supabase project. In Authentication → URL Configuration, set the Site URL to your GitHub Pages origin, for example:

https://glitchyboy-yt.github.io/CloudDock

Add these redirect URLs:
- https://glitchyboy-yt.github.io/CloudDock/account.html
- https://glitchyboy-yt.github.io/CloudDock/reset-password.html

Also add the matching local development URLs when testing locally.

## 2. Apply database migrations

Run these in order in the Supabase SQL Editor:
1. migrations/0001_initial_schema.sql
2. migrations/0002_auth_profile_trigger.sql

The first migration creates customer-owned profiles and service-request records with row-level security. The second creates a profile row when a new Auth user is created.

## 3. Configure the public frontend key

Copy the Project URL and publishable key (or legacy anon key) from Supabase Project Settings → API into supabase-config.js:
- url: Project URL
- anonKey: publishable/anon key

These are browser-facing values. Never put a service_role key, database password, provider token, or any other secret in this repository.

## 4. Configure email authentication

In Supabase Authentication settings:
- Enable email/password sign-in.
- Keep email confirmation enabled for production.
- Configure the email sender and templates before public launch.
- Set the allowed redirect URLs listed above.

## Included authentication features

Email/password sign-up, sign-in, email confirmation flow, password-reset email requests, password update, protected account page, profile display-name update, and sign-out. These become operational only after the Supabase project is configured and migrations are applied.

## Production work still required

GitHub Pages is static hosting. Never trust browser role flags or client-side checks for staff permissions. Admin operations, server provisioning, service console access, file operations, and provider API calls must run through a trusted backend with authorization checks, rate limits, audit logs, and secrets stored server-side. The current service request table is not a live hosting control plane.
