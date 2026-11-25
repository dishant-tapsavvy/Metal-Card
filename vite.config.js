import { cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fine-touch-storefront',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url?.startsWith('/?')) {
            req.url = req.url.replace('/', '/main-website/index.html');
          }
          next();
        });
      },
    },
    {
      name: 'copy-fine-touch-storefront',
      apply: 'build',
      closeBundle() {
        cpSync(
          path.resolve(projectRoot, 'main-website'),
          path.resolve(projectRoot, 'dist', 'main-website'),
          { recursive: true, force: true },
        );
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
