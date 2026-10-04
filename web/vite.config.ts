import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { formguideDevExtractApi } from './plugins/devExtractApi';

export default defineConfig({
  plugins: [react(), tailwindcss(), formguideDevExtractApi()],
  server: {
    port: 5173,
    host: true,
    // No /api proxy to Firebase emulator — extract is served by formguideDevExtractApi
    // in Vite dev so the clickable demo works without emulators.
  },
});
