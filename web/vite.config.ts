import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { formguideDevExtractApi } from './plugins/devExtractApi';

export default defineConfig({
  plugins: [react(), tailwindcss(), formguideDevExtractApi()],
  server: {
    port: 5173,
    host: true,
    // /api/extract is served by formguideDevExtractApi so the text demo works offline.
    // /api/speak needs the Gemini key, which only exists as a Firebase secret, so dev
    // sends it to the deployed function.
    proxy: {
      '/api/speak': { target: 'https://faceapp-5397b.web.app', changeOrigin: true },
    },
  },
});
