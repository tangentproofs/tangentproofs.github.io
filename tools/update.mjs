#!/usr/bin/env node
// Regenerate repos.json (from `gh repo list` + each site's Open Graph tags) and index.html.
//   node tools/update.mjs           fetch fresh data, then render
//   node tools/update.mjs --render  re-render index.html from the committed repos.json only
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "tangentproofs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const overrides = JSON.parse(readFileSync(join(ROOT, "tools/overrides.json"), "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function meta(html, key) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const k = tag.match(/\b(?:property|name)\s*=\s*(["'])(.*?)\1/i);
    const v = tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/is);
    if (k && v && k[2].toLowerCase() === key) return unesc(v[2].trim());
  }
  return null;
}

async function probe(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "tangentproofs-index/1.0" } });
    if (r.status !== 200) return { status: r.status };
    const html = await r.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const out = { status: 200, title: title ? unesc(title[1].trim()) : null,
      ogTitle: meta(html, "og:title"), ogDescription: meta(html, "og:description"), ogImage: meta(html, "og:image") };
    if (out.ogImage) {
      out.ogImage = new URL(out.ogImage, r.url).href;
      const ir = await fetch(out.ogImage, { method: "HEAD" }).catch(() => null);
      if (!ir || ir.status !== 200) out.ogImage = null; // never show a broken card
    }
    return out;
  } catch (e) { return { status: 0, error: String(e) }; }
}

async function fetchData() {
  const raw = JSON.parse(execFileSync("gh", ["repo", "list", ORG, "--visibility", "public", "--no-archived", "--limit", "200",
    "--json", "name,description,homepageUrl,url,pushedAt,primaryLanguage,stargazerCount"], { encoding: "utf8" }));
  const repos = [];
  for (const r of raw) {
    if (overrides.exclude.includes(r.name)) continue;
    const candidates = [r.homepageUrl, `https://${ORG}.github.io/${r.name}/`].filter(Boolean);
    const sites = [];
    for (const u of [...new Set(candidates)]) {
      const p = await probe(u);
      if (p.status === 200) { sites.push({ label: overrides.siteLabel?.[r.name] || "Site", url: u, ...p }); break; }
    }
    for (const extra of overrides.sites?.[r.name] || []) {
      const p = await probe(extra.url);
      if (p.status === 200) sites.push({ ...extra, ...p });
      else console.error(`  ! extra site ${extra.url} -> ${p.status}`);
    }
    const site = sites[0] || null;
    repos.push({
      name: r.name, url: r.url, githubDescription: (r.description || "").trim(),
      language: r.primaryLanguage?.name ?? null, pushedAt: r.pushedAt,
      sites: sites.map((x) => ({ label: x.label, url: x.url, title: x.ogTitle || x.title, description: x.ogDescription, ogImage: x.ogImage })),
      informalization: overrides.informalization.includes(r.name),
    });
    console.error(`${r.name.padEnd(24)} ${sites.length} site(s) ${sites.map((x) => x.ogImage ? "og:image" : "-").join(" ")}`);
  }
  repos.sort((a, b) => (b.informalization - a.informalization) || (!!b.sites.length - !!a.sites.length) || b.pushedAt.localeCompare(a.pushedAt));
  writeFileSync(join(ROOT, "repos.json"), JSON.stringify({ org: ORG, generated: new Date().toISOString(), repos }, null, 2) + "\n");
  return repos;
}

const describe = (r) => overrides.description[r.name] || r.sites.find((x) => x.description)?.description || r.githubDescription || "";

const GH = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

function tile(r) {
  const withCard = r.sites.find((x) => x.ogImage);
  if (withCard)
    return `<a class="thumb" href="${esc(withCard.url)}"><img src="${esc(withCard.ogImage)}" width="1200" height="630" loading="lazy" alt="Preview card for ${esc(r.name)}"></a>`;
  // Generated placeholder: plainly ours, not imitating the project's own card.
  const hue = [...r.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6;
  const site = r.sites[0];
  const inner = `<span class="ph-name">${esc(r.name)}</span><span class="ph-note">${site ? (r.sites.length > 1 ? r.sites.length + " sites" : "site") + " · no preview card" : "repository only"}</span>`;
  return site ? `<a class="thumb ph c${hue}" href="${esc(site.url)}" aria-label="${esc(r.name)} site">${inner}</a>`
                : `<a class="thumb ph c${hue}" href="${esc(r.url)}" aria-label="${esc(r.name)} on GitHub">${inner}</a>`;
}

function card(r) {
  const multi = r.sites.length > 1;
  const host = (u) => new URL(u).host + new URL(u).pathname.replace(/\/$/, "");
  const links = [...r.sites.map((x) => `<a class="btn site" href="${esc(x.url)}">${multi ? `<b>${esc(x.label)}</b> <span class="host">${esc(host(x.url))}</span> →` : "Open site →"}</a>`),
    `<a class="btn gh" href="${esc(r.url)}">${GH} GitHub</a>`].filter(Boolean).join("");
  return `<article class="card${r.informalization ? " inf" : ""}">
  ${tile(r)}
  <div class="body">
    <h3><a href="${esc(r.sites[0]?.url || r.url)}">${esc(r.name)}</a>${r.language ? ` <span class="pill">${esc(r.language)}</span>` : ""}</h3>
    <p>${esc(describe(r))}</p>
    <div class="links${multi ? " multi" : ""}">${links}</div>
  </div>
</article>`;
}

function render(repos) {
  const inf = repos.filter((r) => r.informalization);
  const rest = repos.filter((r) => !r.informalization);
  const url = `https://${ORG}.github.io/`;
  const title = "tangentproofs";
  const desc = "Machine-checked mathematics in Lean 4, and informalizations that read those proofs back into plain English.";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Lean formalizations and informalizations</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="tangentproofs">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${url}assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="tangentproofs: Lean formalizations and plain-English informalizations">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${url}assets/og.png">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<header class="top"><a class="brand" href="./">tangent<span>proofs</span></a>
<nav><a href="#informalizations">Informalizations</a><a href="#formalizations">Formalizations</a><a href="https://github.com/${ORG}">GitHub</a></nav></header>
<main>
<section class="hero">
  <h1>tangent<span>proofs</span></h1>
  <p class="tag">Machine-checked mathematics in <b>Lean&nbsp;4</b> — and <em>informalizations</em> that read those proofs back into plain English.</p>
</section>
${inf.length ? `<section id="informalizations">
<h2>Informalizations <span class="muted small">Lean → English</span></h2>
<p class="muted lede">The formalization process run backwards: each site walks a Lean proof node by node, with the formal statement, a plain-English explanation, a quiz, interactive demos and discussion.</p>
<div class="grid feature">${inf.map(card).join("\n")}</div>
</section>` : ""}
<section id="formalizations">
<h2>${inf.length ? "More formalizations &amp; tools" : "Repositories"}</h2>
<div class="grid">${rest.map(card).join("\n")}</div>
</section>
</main>
<footer>${repos.length} public repositories in <a href="https://github.com/${ORG}">github.com/${ORG}</a> · list generated by <a href="https://github.com/${ORG}/${ORG}.github.io/blob/main/tools/update.mjs"><code>tools/update.mjs</code></a></footer>
</body>
</html>
`;
  writeFileSync(join(ROOT, "index.html"), html);
}

const renderOnly = process.argv.includes("--render");
const repos = renderOnly ? JSON.parse(readFileSync(join(ROOT, "repos.json"), "utf8")).repos : await fetchData();
render(repos);
console.error(`wrote index.html (${repos.length} repos)`);
