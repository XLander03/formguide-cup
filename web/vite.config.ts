import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { formguideDevExtractApi } from './plugins/devExtractApi';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), formguideDevExtractApi()],
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [rootDir, path.resolve(rootDir, '..')],
    },
    // /api/extract is served by formguideDevExtractApi so the text demo works offline.
    // /api/speak needs the Gemini key, which only exists as a Firebase secret, so dev
    // sends it to the deployed function.
    proxy: {
      '/api/speak': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      '/api/ingestForm': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      '/api/publishForm': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      '/api/publishedForms': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      '/api/publishedFormPdf': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      '/api/planJourney': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      // Admin console (shared/forms/admin.ts ADMIN_API); `?mock=1` serves these in-browser instead.
      '/api/adminForm': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
      '/api/setFormStatus': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
