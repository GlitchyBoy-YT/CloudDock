# CloudDock

**Your projects. Our infrastructure.**

CloudDock is an in-development hosting platform concept for Minecraft servers, Discord bots, websites, multiplayer game servers, virtual private servers, and databases.

## Launch pricing policy

**All planned CloudDock hosting services are free until further notice.** There are no subscriptions, setup fees, paid upgrades, or checkout during this period. If the policy changes in the future, that change will be communicated clearly before paid options are introduced.

Free does not mean unlimited. Any eventual service will have transparent resource and fair-use limits based on available infrastructure capacity. CloudDock is not yet provisioning live hosting through this preview website.

## Public website

A responsive, static HTML/CSS/JavaScript website designed for GitHub Pages.

### Pages
- Home — product overview and free launch policy
- Dashboard — interactive customer control-panel preview with sample services, resource cards, activity, and billing placeholder
- Products — planned hosting categories
- Pricing — free-until-further-notice policy and availability notes
- Locations — infrastructure regions under evaluation
- Status — project/service development status
- Documentation — getting-started information
- Support — FAQs and issue tracker
- Terms and Privacy — preliminary draft notices

### Features
- Responsive layout and mobile navigation
- Dark/light theme switcher with local preference
- Custom CloudDock branding and favicon
- Interactive dashboard navigation and service-detail preview
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

GitHub Pages serves only the static frontend. A production hosting platform will need separately deployed backend APIs, secure authentication, a database, and compute workers. The initial database foundation is documented in `supabase/migrations/0001_initial_schema.sql`. Apply it to a Supabase project only after reviewing the schema and configuring the project. Never place Supabase service-role keys, provider credentials, or other secrets in this repository or frontend code.

## License

See [LICENSE](LICENSE).
