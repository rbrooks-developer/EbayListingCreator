/**
 * Generates public/sitemap.xml at build time.
 * Fetches all published article slugs from Supabase and includes them
 * alongside the home page URL.
 *
 * Reads: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY from .env / environment
 * Writes: public/sitemap.xml
 */

import { writeFileSync } from 'fs';
import { execSync }      from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env so the script works locally; in CI these come from env secrets
config({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SITE_URL      = 'https://createmylistings.com';
const TODAY         = new Date().toISOString().slice(0, 10);

/** Last git commit date — reflects when the site code actually changed. */
function getLastCommitDate() {
  try {
    const iso = execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim();
    return iso.slice(0, 10);
  } catch {
    return TODAY;
  }
}

async function fetchArticles() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.warn('[sitemap] Supabase env vars not set — skipping article URLs');
    return [];
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?select=slug,published_at,created_at&order=published_at.desc`,
    {
      headers: {
        apikey:        SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
    }
  );

  if (!res.ok) {
    console.warn('[sitemap] Failed to fetch articles:', res.status);
    return [];
  }

  return res.json();
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

/** Pick the most recent date from updated_at or published_at. */
function articleLastmod(article) {
  const dates = [article.created_at, article.published_at]
    .filter(Boolean)
    .map((d) => d.slice(0, 10));
  return dates.sort().at(-1) ?? TODAY;
}

async function main() {
  const [articles, homeLastmod] = await Promise.all([
    fetchArticles(),
    Promise.resolve(getLastCommitDate()),
  ]);

  const urls = [
    urlEntry({
      loc:        `${SITE_URL}/`,
      lastmod:    homeLastmod,
      changefreq: 'weekly',
      priority:   '1.0',
    }),
    ...articles
      .filter((a) => a.slug)
      .map((a) =>
        urlEntry({
          loc:        `${SITE_URL}/articles/${a.slug}`,
          lastmod:    articleLastmod(a),
          changefreq: 'monthly',
          priority:   '0.7',
        })
      ),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');

  const outPath = resolve(__dirname, '../public/sitemap.xml');
  writeFileSync(outPath, xml, 'utf8');
  console.log(`[sitemap] Written ${urls.length} URL(s) — home lastmod: ${homeLastmod}`);
}

main().catch((e) => {
  console.error('[sitemap] Error:', e.message);
  process.exit(1);
});
