const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Dev-only: serve the Vercel functions in /api (stream relay + player_api proxy)
// from the Metro dev server, so web on http://localhost:8081 can play streams
// despite the upstream's missing CORS headers.
function loadHandler(file) {
  const src = fs
    .readFileSync(path.join(__dirname, 'api', file), 'utf8')
    .replace('export default', 'module.exports =');
  const mod = { exports: null };
  new Function('module', 'fetch', 'Buffer', 'URL', 'URLSearchParams', src)(
    mod, fetch, Buffer, URL, URLSearchParams,
  );
  return mod.exports;
}

const routes = { '/api/stream': 'stream.js', '/api/proxy': 'proxy.js' };

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => (req, res, next) => {
    const parsed = new URL(req.url, 'http://localhost');
    const file = routes[parsed.pathname];
    if (!file) return metroMiddleware(req, res, next);

    req.query = Object.fromEntries(parsed.searchParams);
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
    };
    res.send = (body) => res.end(body);
    loadHandler(file)(req, res).catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  },
};

module.exports = config;
