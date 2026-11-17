import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local stand-in for Vercel serverless functions: /api/<name> -> api/<name>.js
// (uses in-memory storage unless Upstash env vars are present)
function apiDevServer() {
  return {
    name: 'matchpoint-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const u = new URL(req.url, 'http://localhost');
        const m = u.pathname.match(/^\/api\/([a-z]+)\/?$/);
        if (!m) return next();
        let raw = '';
        for await (const chunk of req) raw += chunk;
        req.body = raw ? JSON.parse(raw) : undefined;
        req.query = Object.fromEntries(u.searchParams);
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          await mod.default(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
  base: './',
  server: { port: 5190 },
});
