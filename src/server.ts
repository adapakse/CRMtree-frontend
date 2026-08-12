import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');
const API_UPSTREAM = process.env['API_UPSTREAM'] || 'http://127.0.0.1:3001';
// Set to 'test' on non-production Container Apps (int, previews) via env var override;
// the Dockerfile bakes in 'production' as the default for the real prod image.
const APP_ENV = process.env['APP_ENV'] || 'production';

const app = express();

// Azure Container Apps ingress sits directly in front of this container and adds
// x-forwarded-* headers — without trusting them, Angular silently deopts to CSR
// (no crash, just loses SSR/SEO on every request behind the platform's own proxy).
// Azure also sends a non-standard "x-forwarded-path" (Angular only knows
// "x-forwarded-prefix"), so the standard headers alone aren't enough — list it explicitly.
//
// allowedHosts: Angular's SSRF guard rejects any request whose Host/X-Forwarded-Host
// isn't on this list — every one of our real front doors needs to be here, or
// server-rendered routes 400 with "Header ... is not allowed" instead of rendering.
const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['crmtree.pl', '*.crmtree.pl', 'int.crmtree.pl', '*.int.crmtree.pl'],
  trustProxyHeaders: [
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-forwarded-proto',
    'x-forwarded-prefix',
    'x-forwarded-path',
  ],
});

/**
 * Reverse-proxy /api/* to the backend — replaces the role nginx used to play
 * in the old static-nginx Docker image (see Dockerfile).
 */
app.use('/api', createProxyMiddleware({
  target: API_UPSTREAM,
  changeOrigin: true,
  // Express strips the '/api' mount prefix before the middleware sees req.url — add it back.
  pathRewrite: (path) => `/api${path}`,
  // SEObot article generation is a single long-lived request (multiple sequential
  // Claude calls, several minutes) — without this the proxy's default timeout kills
  // the connection long before the backend responds, and the client just hangs.
  proxyTimeout: 600_000,
  timeout: 600_000,
  on: {
    proxyReq: (proxyReq, req) => {
      // changeOrigin above rewrites the outbound Host header to match
      // API_UPSTREAM (api.crmtree.pl) — the backend would otherwise never
      // learn which tenant subdomain the browser actually used. Forward it
      // separately so the backend's tenant-subdomain isolation guard
      // (middleware/auth.js) can read it. x-forwarded-host (set by Azure's
      // own ingress in front of *this* container, already trusted above for
      // Angular SSR rendering) is the real external host; req.headers.host
      // is the local-dev fallback when there's no ingress in front.
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
      if (host) proxyReq.setHeader('x-crm-tenant-host', host);
    },
  },
}));

/**
 * sitemap.xml / robots.txt — built from the backend's published blog posts.
 */
app.get('/sitemap.xml', async (req, res) => {
  const baseUrl = 'https://crmtree.pl';
  const staticPaths = ['/', '/blog', '/polityka-prywatnosci', '/regulamin'];
  let slugs: string[] = [];
  try {
    const r = await fetch(`${API_UPSTREAM}/api/public/blog?locale=pl`);
    if (r.ok) {
      const posts = (await r.json()) as { slug: string }[];
      slugs = posts.map((p) => p.slug);
    }
  } catch {
    // Sitemap still works with just the static paths if the backend is unreachable.
  }
  const urls = [...staticPaths, ...slugs.map((s) => `/blog/${s}`)]
    .map((path) => `  <url><loc>${baseUrl}${path}</loc></url>`)
    .join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
  );
});

/**
 * Lets the browser bundle read the runtime APP_ENV env var — Angular's compiled
 * client bundle has no access to process.env, so this is the only way it can
 * tell int/preview apart from real production (both use the same build output).
 */
app.get('/env-config.json', (req, res) => {
  res.type('application/json').send(JSON.stringify({ appEnv: APP_ENV }));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    ['User-agent: *', 'Disallow: /dashboard', 'Disallow: /crm/', 'Disallow: /admin/', `Sitemap: https://crmtree.pl/sitemap.xml`].join('\n'),
  );
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
