import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
 plugins: [react(), tailwindcss()],
 build: { rollupOptions: { output: { manualChunks: {
  map: ['maplibre-gl'], charts: ['recharts'], database: ['@supabase/supabase-js'],
 } } } },
});
