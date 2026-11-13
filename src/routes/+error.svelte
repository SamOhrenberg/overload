<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { WifiOff, TriangleAlert } from 'lucide-svelte';

  // 503 = the service worker had no network and no cached copy. A 500 while the
  // device reports offline is the same thing without a service worker (e.g. the
  // app served over plain HTTP, where browsers don't allow one).
  let offline = $derived(
    $page.status === 503 || ($page.status === 500 && typeof navigator !== 'undefined' && !navigator.onLine)
  );

  let retrying = $state(false);
  // Retry as a client-side navigation rather than a full reload: if we're still
  // offline, a reload can drop the whole app for the browser's offline page.
  async function retry() {
    retrying = true;
    try {
      await goto($page.url, { invalidateAll: true, replaceState: true });
    } finally {
      retrying = false;
    }
  }
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm rounded-lg bg-surface p-6 text-center shadow-e1">
    {#if offline}
      <WifiOff class="mx-auto mb-3 text-fg-muted" size={32} />
      <h1 class="mb-2 text-h1 text-fg">You're offline</h1>
      <p class="mb-5 text-fg-2">
        This screen isn't available offline. Sets you've logged are saved on this device and will
        sync when you're back online.
      </p>
    {:else}
      <TriangleAlert class="mx-auto mb-3 text-warning" size={32} />
      <h1 class="mb-2 text-h1 text-fg">{$page.status}</h1>
      <p class="mb-5 text-fg-2">{$page.error?.message ?? 'Something went wrong.'}</p>
    {/if}
    <div class="flex justify-center gap-2">
      <button
        class="rounded-full bg-surface-2 px-5 py-2.5 text-label text-fg"
        onclick={() => history.back()}>Back</button
      >
      <button
        class="rounded-full bg-accent px-5 py-2.5 text-label text-accent-on disabled:opacity-60"
        disabled={retrying}
        onclick={retry}>{retrying ? 'Trying…' : 'Try again'}</button
      >
    </div>
  </div>
</div>
