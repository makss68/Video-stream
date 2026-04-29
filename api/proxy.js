export default async function handler(req, res) {
  const { serverUrl, ...params } = req.query;

  if (!serverUrl) {
    return res.status(400).json({ error: 'Missing serverUrl' });
  }

  const cleanUrl = decodeURIComponent(serverUrl).replace(/\/+$/, '');
  const searchParams = new URLSearchParams(params);
  const targetUrl = `${cleanUrl}/player_api.php?${searchParams}`;

  try {
    const response = await fetch(targetUrl);
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
}
