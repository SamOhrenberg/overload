// Build the standalone UI for GitHub Pages into build-pages/.
//   BASE_PATH=/overload node scripts/build-pages.mjs   (project site at user.github.io/overload)
//   node scripts/build-pages.mjs                        (user site or custom domain)
import { execSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';

process.env.BUILD_TARGET = 'pages';
execSync('npx vite build', { stdio: 'inherit', env: process.env });

// GitHub Pages serves 404.html for unknown paths (deep links); the root needs
// the same app shell as index.html. .nojekyll keeps the _app/ folder served.
copyFileSync('build-pages/404.html', 'build-pages/index.html');
writeFileSync('build-pages/.nojekyll', '');
console.log('\nStatic UI ready in build-pages/');
