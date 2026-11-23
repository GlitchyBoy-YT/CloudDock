# CloudDock

**Your projects. Our infrastructure.**

CloudDock is an in-development hosting platform concept for Minecraft servers, Discord bots, websites, multiplayer game servers, virtual private servers, and databases.

## Launch pricing policy

**All planned CloudDock hosting services are free until further notice.** There are no subscriptions, setup fees, paid upgrades, or checkout during this period. Any future policy change will be communicated clearly before paid options are introduced.

Free does not mean unlimited. Any eventual service will have transparent resource and fair-use limits based on available infrastructure capacity. CloudDock is not yet provisioning live hosting through this preview website.

## Public website

A responsive, static HTML/CSS/JavaScript website designed for GitHub Pages.

### Pages
- Home — platform overview and free launch policy
- Dashboard — interactive customer control-panel preview with sample services
- Products — six planned hosting categories and intended feature sets
- Pricing — free-until-further-notice policy
- Locations — infrastructure regions under evaluation
- Roadmap — project milestones and development direction
- Status — honest development status (not a live uptime monitor)
- Documentation — product preparation and security guides
- Support — FAQs and GitHub feedback links
- Terms and Privacy — preliminary draft notices

### Features
- Responsive layouts and mobile navigation
- Dark/light theme switcher with local preference
- Custom CloudDock branding and favicon
- Interactive dashboard preview with service detail modal
- Product, documentation, roadmap, support, and policy pages
- No build step or package installation required
- GitHub Pages-compatible relative asset paths

## Run locally

Open `index.html` in a browser or run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy with GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose `main` and `/(root)`.
4. Save and wait for deployment.

Expected URL: https://glitchyboy-yt.github.io/CloudDock/

## Development status and architecture

CloudDock is in development. Product descriptions and region listings describe planned offerings, not live infrastructure. The dashboard is a static visual preview with sample data only. There is no production authentication, live monitoring API, support ticket system, or service provisioning.

GitHub Pages serves only the static frontend. A production hosting platform will need separately deployed backend APIs, secure authentication, a database, and compute workers. The initial database foundation is documented in `supabase/README.md` and `supabase/migrations/0001_initial_schema.sql`. Apply it to a Supabase project only after reviewing the schema and configuring the project. Never place Supabase service-role keys, provider credentials, or other secrets in this repository or frontend code.

## Contributing

Use GitHub Issues for reproducible bugs and feature requests. Do not include passwords, access tokens, private keys, or sensitive personal information in public issues.

## License

See [LICENSE](LICENSE).
