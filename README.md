# KK26 Voting Receipts

This repository separates the private/result-generation pipeline from the public
static site that is deployed to GitHub Pages.

## Public Site

The deployable site lives in `site/`. Treat everything in this directory as
public:

- `site/index.html`
- `site/projects.html`
- `site/outcomes.html`
- `site/info.html`
- `site/assets/css/`
- `site/assets/js/`
- `site/assets/data/kk26.json`
- `site/assets/data/kk26-data.js`

The site is standalone. It loads its public data from
`site/assets/data/kk26-data.js`, which is generated from the same public JSON
payload in `site/assets/data/kk26.json`. It does not depend on files outside
`site/` at runtime.

## Build

Regenerate the public data file:

```sh
make build-site
```

Check that the deploy folder does not contain obvious private or obsolete files:

```sh
make check-public
```

Run the static site locally:

```sh
make serve-site
```

Then open `http://localhost:8000`.

## Deploy

Pushes to `main` automatically publish the standalone `site/` directory to the
`gh-pages` branch with GitHub Actions.

You can also deploy manually:

```sh
make deploy-site
```

Both deployment paths publish only the `site/` subtree.
