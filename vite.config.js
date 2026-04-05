import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set base to './' so asset paths work on GitHub Pages subdirectory hosting.
// If your repo is at https://username.github.io/repo-name, change base to '/repo-name/'.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
