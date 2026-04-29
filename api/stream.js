// Node.js runtime — Edge runtime blocks fetch to direct IP addresses (e.g. IPTV
// servers that expose picons or segments via bare IPs). Node.js has no such restriction.

export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) { res.status(400).end('Missing url'); return; }

  const decoded = decodeURIComponent(url);

  // Forward browser-style headers but strip anything that flags a request as proxied.
  // Notably: no X-Forwarded-For (IPTV WAFs reject when present) and no Referer
  // (avoids leaking the Vercel domain, which the upstream has never seen).
  const upstreamHeaders = {
    'User-Agent':
      req.headers['user-agent'] ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    Accept: req.headers['accept'] || '*/*',
    'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (req.headers['range']) upstreamHeaders['Range'] = req.headers['range'];

  let response;
  try {
    response = await fetch(decoded, { headers: upstreamHeaders });
  } catch (err) {
    res.status(502).end(String(err));
    return;
  }

  const isPlaylist =
    decoded.includes('.m3u8') ||
    (response.headers.get('content-type') ?? '').toLowerCase().includes('mpegurl');

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(response.status);

  if (isPlaylist) {
    // Rewrite every URL line so segments/sub-playlists go through this proxy too.
    // Critical: HLS.js resolves relative URLs against the manifest URL. Since the
    // manifest is served from `/api/stream?url=...`, a relative segment like
    // `seg001.ts` would otherwise resolve to `/api/seg001.ts` and get caught by
    // the SPA rewrite, returning index.html where TS data was expected.
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    const text = await response.text();
    const rewritten = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const absUrl = new URL(trimmed, decoded).toString();
          return `/api/stream?url=${encodeURIComponent(absUrl)}`;
        } catch {
          return line;
        }
      })
      .join('\n');
    res.end(rewritten);
    return;
  }

  res.setHeader(
    'Content-Type',
    response.headers.get('content-type') || 'application/octet-stream',
  );

  if (!response.body) { res.end(); return; }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}
