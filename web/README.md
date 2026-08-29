# MeshDrop web claim page

The static, zero-backend site behind the viral funnel:

- **Claim page** — `meshdrop.app/d/CODE` (or `/d/CODE` on the raw Pages URL)
  shows "You received a drop", tries the `meshdrop://` deep link, and falls
  back to the platform download button.
- **Landing page** — the root URL sells the product and offers downloads for
  Windows, macOS, and Linux.

No server, no database, no framework, no external requests. It's HTML + CSS +
vanilla JS that runs entirely in the browser — fitting for a zero-cloud brand.

## How the link format works

The sender's app generates a link with the drop code (and optional metadata):

```
https://meshdrop.app/d/DROP-XXXX-XXXX?n=Movie.mp4&s=248000000&a=Laptop
```

- `n` — filename (display only, not secret)
- `s` — size in bytes (display only)
- `a` — sender device name (display only)

The code is parsed from the path (`/d/CODE`), the hash (`#/d/CODE`), or the
`?c=` query param. Metadata is optional — the page is equally useful with a
bare code.

## Local preview

```bash
python -m http.server 8000 --directory web
# or: npx serve web
```

Then open:

- `http://localhost:8000` — landing view
- `http://localhost:8000/?c=DROP-TEST-1234` — claim view (query form works
  locally; the `/d/CODE` path form needs the Pages fallback)

## Deploying for free

### Option A — GitHub Pages (zero config, recommended to start)

1. Push this repo, then go to **Settings → Pages**.
2. **Build and deployment → Source: GitHub Actions**.
3. The included `.github/workflows/deploy-pages.yml` deploys `web/` to Pages on
   every push to `main` that touches `web/**`.
4. The site is live at `https://<user>.github.io/meshdrop-app/`. The path form
   `/d/CODE` works via `404.html`.

### Option B — Cloudflare Pages (free, global CDN)

1. **Workers & Pages → Create → Pages → Connect to Git**, pick the repo,
   build command: none, output directory: `web`.
2. The `_redirects` file makes `/d/CODE` path routing work.
3. Unlimited free bandwidth — good when the funnel starts getting traffic.

### Custom domain

Buy `meshdrop.app` (or `.dev` — both enforce HTTPS, on-brand for a security
product) at Porkbun / Cloudflare Registrar / Namecheap, then add it under the
host's **Custom domains** setting. No code changes needed.

## Releasing a new version

The download buttons point at the GitHub Releases assets. When you cut a new
release, bump `VERSION` in `app.js` — that's the only change needed:

```js
const VERSION = '1.0.0-beta.2' // -> next version
```

## Hooking the sender app into this page

The desktop app generates web links from `renderer/src/lib/shareLinks.ts` —
that's the single source of truth. Copied links look like:

```
https://aamirali51.github.io/meshdrop-app/d/DROP-XXXX-XXXX?n=Movie.mp4&s=248000000
```

When the custom domain goes live, change one constant there:

```ts
export const WEB_LINK_BASE = 'https://meshdrop.app/d/'
```

No other change needed — links open the app when it's installed (via the
claim page's deep link) and convert recipients when it isn't.

## Notes

- **Asset paths**: both HTML files use an adaptive `<base>` tag so `styles.css`
  and `app.js` resolve against the site root. This matters because GitHub Pages
  serves `404.html` at deep paths like `/d/CODE`, where relative paths would
  resolve to `/d/styles.css` and 404. The base tag works on project Pages
  (`/<repo>/`), custom domains (`/`), and local previews.
- **Privacy by design**: the page makes no network calls beyond its own static
  files. If you add analytics later, use a cookieless, privacy-friendly option
  (Cloudflare Web Analytics or Plausible).
- **XSS**: all URL-derived values are injected with `textContent`, never
  `innerHTML`, so a crafted link cannot execute code.
- The `404.html` file exists only for the GitHub Pages path fallback. If you
  move to Cloudflare Pages, you can delete it.
