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
        const outputPath = path.resolve(projectRoot, 'dist');
        const storefrontPath = path.resolve(projectRoot, 'main-website');
        const appEntryPath = path.resolve(outputPath, 'index.html');

        cpSync(appEntryPath, path.resolve(outputPath, 'admin.html'));
        cpSync(
          storefrontPath,
          path.resolve(outputPath, 'main-website'),
          { recursive: true, force: true },
        );
        cpSync(path.resolve(storefrontPath, 'index.html'), appEntryPath);
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
