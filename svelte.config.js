import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Two build targets from one codebase (see docs/09-deployment-and-client.md):
 *  - default:              Node server — API + UI on one origin (Docker image).
 *  - BUILD_TARGET=pages:   UI only, as static files for GitHub Pages. The user
 *                          enters the API URL on first launch.
 * BASE_PATH sets the sub-path for a GitHub Pages project site, e.g. "/overload".
 */
const pages = process.env.BUILD_TARGET === 'pages';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: pages
      ? // SPA: every unknown path serves the app shell (GitHub Pages uses 404.html).
        adapterStatic({ pages: 'build-pages', assets: 'build-pages', fallback: '404.html' })
      : adapterNode(),
    paths: { base: pages ? process.env.BASE_PATH ?? '' : '' },
    // The same check is applied in hooks.server.ts, minus the OAuth token /
    // revoke endpoints, which MCP clients call server-to-server with a
    // form-encoded body and no Origin header (they're bearer/PKCE-protected).
    csrf: { checkOrigin: false }
  }
};

export default config;
