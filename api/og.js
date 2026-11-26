export default function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'stl-raffle-pcso.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const fullOrigin = `${proto}://${host}`;
  const imageUrl = `${fullOrigin}/images/share-preview.jpg`;
  const title = '🌾 STL Community Rice Raffle | 6 Lucky Rice Winners!';
  const description = 'Sumali sa opisyal na STL Community Rice Raffle! 6 Maswerteng Winners ng Bigas (5kg at 25kg). Pindutin ang link para mag-proceed sa browser at makuha ang iyong raffle ticket!';

  const html = `<!DOCTYPE html>
<html lang="fil">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">

  <!-- Open Graph / Facebook / Messenger / Viber / WhatsApp -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="STL Community Rice Raffle">
  <meta property="og:url" content="${fullOrigin}/">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1376">
  <meta property="og:image:height" content="768">
  <meta property="og:image:alt" content="STL Community Rice Raffle Banner">

  <!-- Twitter Card / Telegram -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${fullOrigin}/">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:image:alt" content="STL Community Rice Raffle Banner">
</head>
<body>
  <p>Redirecting to <a href="${fullOrigin}/">${title}</a>...</p>
  <script>window.location.replace("${fullOrigin}/");</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).send(html);
}
