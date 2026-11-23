# CloudDock

**Your projects. Our infrastructure.**

CloudDock is an in-development hosting platform concept for Minecraft servers, Discord bots, websites, multiplayer game servers, virtual private servers, and databases.

## Public website

A responsive, static HTML/CSS/JavaScript website designed for GitHub Pages.

### Pages
- Home — product overview and platform introduction
- Products — planned hosting categories
- Pricing — planned tiers (no checkout is active)
- Locations — infrastructure regions under evaluation
- Status — honest project/service status
- Documentation — getting-started information
- Support — FAQs and issue tracker
- Terms and Privacy — preliminary draft notices

### Features
- Responsive layout and mobile navigation
- Dark/light theme switcher with local preference
- Custom CloudDock branding and favicon
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

CloudDock is in development. Product descriptions and region listings describe planned offerings, not live infrastructure. The preview has no production authentication, checkout, customer control panel, live monitoring API, or service provisioning.

GitHub Pages serves only the static frontend. A production hosting platform will need separately deployed backend APIs, secure authentication, billing, databases, and compute workers. Never place Supabase service-role keys, provider credentials, or other secrets in this repository or frontend code.

## License

See [LICENSE](LICENSE).
