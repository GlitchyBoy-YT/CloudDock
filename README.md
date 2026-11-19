# CloudDock

CloudDock is an open-source dashboard project for a future multi-platform bot hosting service supporting **Discord, Nerimity, Fluxer, and Stoat**.

## Current status

The repository currently contains a static frontend demo. It is suitable for GitHub Pages and includes:

- Overview dashboard and application directory
- Application creation flow with platform/runtime selection
- Search and platform filtering
- Demo-only start/stop controls and sample deployment/monitoring pages
- Usage, team, settings, and documentation views
- Browser-local demo state; no credentials or bot tokens are collected

**Important:** The demo does not host bots. Create/start/stop actions only change local browser data. Sample uptime, resource usage, deployments, and logs are illustrative.

## Publish on GitHub Pages

1. Open repository **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose `main` and `/ (root)`, then save.
4. GitHub Pages will publish `index.html`.

## Production architecture

GitHub Pages serves static files only. A real hosting platform needs separately deployed services:

```text
Dashboard (GitHub Pages)
       │ HTTPS + authenticated session
       ▼
Control API ─── Database + encrypted secret store
       │
       ├── Discord adapter
       ├── Nerimity adapter
       ├── Fluxer adapter
       └── Stoat adapter
       ▼
Job queue + scheduler
       ▼
Isolated worker containers
```

The backend should provide authentication, workspace authorization, application metadata, encrypted token storage, deployment orchestration, resource quotas, logs/metrics, audit records, and platform-specific adapters. Workers should run customer code in isolated containers with CPU, memory, process, filesystem, and network limits.

## Security requirements

- Never put bot tokens, API keys, or database credentials in frontend code or Git.
- Never execute customer code inside the control API process.
- Encrypt credentials server-side and expose them only to the authorized worker at runtime.
- Use short-lived worker credentials, least-privilege permissions, quotas, audit logs, and abuse controls.
- Validate each platform's current developer policies before launching its adapter.

## Suggested API surface

- `GET/POST /api/v1/apps`
- `GET /api/v1/apps/:appId`
- `POST /api/v1/apps/:appId/deployments`
- `POST /api/v1/apps/:appId/actions/start`
- `POST /api/v1/apps/:appId/actions/stop`
- `GET /api/v1/apps/:appId/logs`
- `GET /api/v1/usage`

These endpoints are a design proposal; no live API or worker runtime is included yet.

## License

MIT. See [LICENSE](LICENSE).
