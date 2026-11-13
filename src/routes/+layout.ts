// The UI is a pure client-side app: it can be served by the API server or as
// static files from anywhere (GitHub Pages), and talks to the API over fetch.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'never';
