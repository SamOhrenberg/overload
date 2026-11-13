import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    // Standalone static UI (GitHub Pages) — no API on its own origin.
    __STANDALONE__: JSON.stringify(process.env.BUILD_TARGET === 'pages')
  },
  server: {
    port: 5173
  }
});
