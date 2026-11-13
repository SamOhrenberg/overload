// See https://svelte.dev/docs/kit/types#app.d.ts

import type { SessionUser } from '$lib/server/auth/session';

declare global {
  /** Build-time flag: true for the standalone static (GitHub Pages) build. */
  const __STANDALONE__: boolean;

  namespace App {
    interface Locals {
      user: SessionUser | null;
      sessionId: string | null;
    }
    // interface Error {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
