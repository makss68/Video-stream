export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) return new Response('Missing url', { status: 400 });

  const decoded = decodeURIComponent(url);

  let response;
  try {
    response = await fetch(decoded);
  } catch (err) {
    return new Response(String(err), { status: 502 });
  }

  const contentType = response.headers.get('content-type') || '';
  const isPlaylist = contentType.includes('mpegurl') || decoded.includes('.m3u8');

  if (isPlaylist) {
    const text = await response.text();
    const baseUrl = decoded.substring(0, decoded.lastIndexOf('/') + 1);

    // Rewrite every media/playlist line so segments are also fetched via this proxy.
    // This keeps all traffic HTTPS and avoids mixed-content blocks in the browser.
    const rewritten = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const absUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `/api/stream?url=${encodeURIComponent(absUrl)}`;
      })
      .join('\n');

    return new Response(rewritten, {
      status: response.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // For TS segments, MP4, and other media — stream the bytes directly
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
