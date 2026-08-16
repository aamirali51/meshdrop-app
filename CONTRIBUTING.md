# Contributing to MeshDrop

Thanks for wanting to help! MeshDrop is a zero-cloud P2P file-sharing app —
no accounts, no cloud, no size limits. It's built on the Holepunch
(Hyperswarm/Hypercore) stack and ships for Windows, macOS, and Linux, with an
Android app in development.

Contributions of all kinds are welcome: bug reports, documentation, UI
polish, engine improvements, and packaging work.

---

## Getting started

Prerequisites: **Node.js 20+**.

```bash
# 1. Fork & clone (replace <you> with your GitHub username)
git clone https://github.com/<you>/MeshDesk.git
cd MeshDesk

# 2. Install dependencies
npm install

# 3. Start the dev app (Vite + Electron)
npm run dev

# 4. Run the engine E2E suite (41/41 checks over the public DHT)
npm test

# 5. Lint & format before submitting
npm run lint
npm run format
```

For local P2P testing without a second machine:

```bash
npm run dev:p2p    # two side-by-side engine instances
npm run dev:multi  # two Electron windows as peers
```

## Project layout

| Path | What it is |
| :--- | :--- |
| `core/` | **`@mesh/core`** — the standalone, platform-agnostic P2P engine (MIT). No Electron, no DOM. This is what runs the network: pairing, drop codes, transfers. |
| `electron/` | The Electron main-process shell that owns the engine in-process and bridges it to the UI. |
| `renderer/` | The React + TypeScript + Tailwind UI (glassmorphic design system). |
| `docs/` | Architecture references and design briefs. |

The engine and the app are intentionally decoupled — changes to one usually
shouldn't require changes to the other.

## Code style

- **Prettier** for formatting and **lunte** for linting — `npm run lint`
  checks both, `npm run format` fixes both. Please run them before pushing.
- Match the surrounding style: keep comments concise and honest, prefer plain
  functions over clever abstractions, and never add telemetry or fabricated
  data — MeshDrop reports only what is actually measured.
- Write meaningful, conventional commit messages (e.g. `feat:`, `fix:`,
  `docs:`, `test:`, `chore:`).

## Making a change

1. Create a branch: `git checkout -b feat/your-change`.
2. Make your changes and add tests where the behavior is testable (the
   engine has a CLI E2E harness at `core/test.js`).
3. Run `npm run lint` and `npm test`.
4. Push and open a pull request against `main`. Describe *what* changed and
   *why*; screenshots or GIFs are welcome for UI changes.

Small, focused PRs get reviewed and merged much faster than large ones.

## Developer Certificate of Origin (DCO)

We require a sign-off on every commit so we always have a clean chain of
authorship — this lets MeshDrop stay under the MIT License without needing a
separate contributor agreement.

By contributing, you agree to the [Developer Certificate of Origin](https://developercertificate.org/):

> Developer's Certificate of Origin 1.1
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the
>     right to submit it under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my
>     knowledge, is covered under an appropriate open source license and I
>     have the right under that license to submit that work with modifications,
>     whether created in whole or in part by me, under the same open source
>     license (unless I am permitted to submit under a different license), as
>     indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who
>     certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are
>     public and that a record of the contribution (including all personal
>     information I submit with it, including my sign-off) is maintained
>     indefinitely and may be redistributed consistent with this project or
>     the open source license(s) involved.

Sign your commits with `git commit -s` (adds `Signed-off-by: Your Name
<you@example.com>`). If your PR contains commits without a sign-off, we'll
ask you to add one.

## Licensing & brand

- **Code** — All contributions are accepted under the [MIT License](LICENSE),
  and the project as a whole is MIT-licensed.
- **Brand** — The **MeshDrop name, logo, and icons are trademarks** and are
  governed by the [Trademark Policy](TRADEMARK_POLICY.md). They apply to
  contributors and users alike; a fork must not use the MeshDrop name or
  branding.

## Reporting security issues

MeshDrop is a security- and privacy-focused product, so we treat
vulnerabilities seriously.

- **Do not open a public issue** for a security vulnerability.
- Email the maintainers privately (see the repository owner's contact info on
  GitHub), or open a draft PR with the fix described so it isn't published as
  an exploit.
- Include a description of the issue, the affected version, and a minimal
  repro if possible.

We will acknowledge, fix, and disclose responsibly.

---

Questions? Open a discussion or an issue — we're friendly.
