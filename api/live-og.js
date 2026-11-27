/**
 * Vercel Serverless Function: /api/live-og
 * Serves the /live page with Open Graph meta tags specific to the Live Draw.
 * When the link is pasted in Messenger GC, the OG scraper sees live-specific
 * title, description, and OG image (share-preview.jpg).
 *
 * On production Vercel: reads dist/index.html (built React app) and replaces OG tags.
 * The page still loads the same React SPA — OG tags are only for social scrapers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function handler(req, res) {
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://stl-raffle-campaign.vercel.app';

  // Try to read the built index.html from dist/
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
  let html = '';
  try {
    html = fs.readFileSync(distIndex, 'utf-8');
  } catch {
    // Fallback: build a minimal HTML if dist/index.html not found
    html = `<!DOCTYPE html><html lang="fil"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>🔴 STL LIVE DRAW - Panoorin Ngayon!</title>
<meta property="og:url" content="${origin}/live"/>
<meta property="og:title" content="🔴 STL LIVE DRAW - Panoorin Ngayon!"/>
<meta property="og:description" content="🌾 Live na ang STL Community Rice Raffle Draw! I-click para manood ng live!"/>
<meta property="og:image" content="${origin}/images/share-preview.jpg"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
</head><body><div id="root"></div></body></html>`;
  }

  // Replace OG URL and title with /live-specific values
  html = html
    .replace(/https:\/\/stl-raffle-(campaign|pcso)\.vercel\.app/g, origin)
    .replace(/content="\/images\/share-preview\.(jpg|png)"/g, `content="${origin}/images/share-preview.jpg"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${origin}/live"`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="🔴 STL LIVE DRAW - Panoorin Ngayon!"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="🌾 Live na ang STL Community Rice Raffle Draw! Panoorin kung sino ang mananalo ng bigas. I-click para manood ng live!"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="🔴 STL LIVE DRAW - Panoorin Ngayon!"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="🌾 Live na ang STL Community Rice Raffle Draw! Panoorin kung sino ang mananalo ng bigas!"`)
    .replace(/<title>[^<]*<\/title>/, `<title>🔴 STL LIVE DRAW - Panoorin Ngayon!</title>`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache 5 minutes (300s) so Messenger/Facebook scraper re-fetches occasionally
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
}
