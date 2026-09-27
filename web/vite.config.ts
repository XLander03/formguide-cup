import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { formguideDevExtractApi } from './plugins/devExtractApi';

export default defineConfig({
  plugins: [react(), formguideDevExtractApi()],
  server: {
    port: 5173,
    host: true,
    // No /api proxy to Firebase emulator — extract is served by formguideDevExtractApi
    // in Vite dev so the clickable demo works without emulators.
  },
});
