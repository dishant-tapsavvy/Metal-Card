import app from '../server/index.js';

export default function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const apiPath = requestUrl.searchParams.get('path')?.replace(/^\/+/, '');

  if (apiPath) {
    requestUrl.searchParams.delete('path');
    req.url = `/api/${apiPath}${requestUrl.search}`;
  }

  return app(req, res);
}
