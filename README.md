# tangentproofs.github.io

The landing page for the [tangentproofs](https://github.com/tangentproofs) organization: every public, non-archived repository, its site(s) and its Open Graph preview card. Live at <https://tangentproofs.github.io/>.

The page is plain static HTML served by GitHub Pages from the root of `main`. No client-side GitHub API calls.

## Updating the list

```sh
node tools/update.mjs           # gh repo list + fetch each site's og tags -> repos.json + index.html
node tools/update.mjs --render  # re-render index.html from the committed repos.json only
```

Needs Node 18+ and an authenticated `gh`. For each repo it probes the GitHub homepage URL and `https://tangentproofs.github.io/<repo>/`. It lists a site only if it returns 200, and it shows a site's `og:image` only if that image also returns 200. Otherwise the card gets a generated placeholder tile. The shown description is the site's `og:description` when it has one, otherwise the GitHub description.

Hand-maintained hints live in [`tools/overrides.json`](tools/overrides.json):

- `informalization`: repos featured in the "Informalizations" section. Add `eulers-gem` / `turyn` here when their sites land.
- `sites`: extra site links per repo, for example laptop's live tool at aptop.tangentcode.com.
- `siteLabel`: the label for a repo's own Pages site when it has several.
- `description`: per-repo description overrides.
- `exclude`: repos to hide.

Commit the regenerated `repos.json` and `index.html`.

## Preview card

`assets/og.png` (1200×630) is rendered from `tools/og/og.html`:

```sh
google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
  --screenshot=assets/og.png tools/og/og.html
```
