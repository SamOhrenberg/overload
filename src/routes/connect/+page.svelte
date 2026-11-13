<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { Plus, X, CircleCheck, CircleX, LoaderCircle } from 'lucide-svelte';
  import {
    STANDALONE,
    getEndpoints,
    setEndpoints,
    normalizeEndpoint,
    probe,
    isMixedContent
  } from '$lib/client/api';

  // '' (same-origin) isn't something to type in; show it as an empty list.
  const saved = getEndpoints().filter(Boolean);
  const firstRun = saved.length === 0;
  let urls = $state<string[]>(saved.length ? saved : ['']);
  let status = $state<Record<number, 'checking' | 'ok' | 'fail'>>({});
  let error = $state<string | null>(null);
  let busy = $state(false);
  let failedSave = $state(false);

  const origin = typeof location !== 'undefined' ? location.origin : '';
  const httpsPage = typeof location !== 'undefined' && location.protocol === 'https:';

  function cleaned(): string[] | null {
    const out: string[] = [];
    for (const raw of urls) {
      if (!raw.trim()) continue;
      const n = normalizeEndpoint(raw);
      if (!n) {
        error = `“${raw}” isn't a valid address.`;
        return null;
      }
      if (!out.includes(n)) out.push(n);
    }
    return out;
  }

  async function test(): Promise<boolean> {
    error = null;
    const list = cleaned();
    if (!list) return false;
    if (!list.length && STANDALONE) {
      error = 'Enter the address of your Overload server.';
      return false;
    }
    urls = list.length ? [...list] : [''];
    status = Object.fromEntries(list.map((_, i) => [i, 'checking' as const]));
    const results = await Promise.all(list.map((u) => probe(u, 5000)));
    status = Object.fromEntries(results.map((ok, i) => [i, ok ? 'ok' : 'fail'] as const));
    return results.some(Boolean) || !list.length;
  }

  async function save(force = false) {
    busy = true;
    try {
      const ok = await test();
      if (error) return;
      if (!ok && !force) {
        failedSave = true;
        error = 'None of these addresses answered.';
        return;
      }
      setEndpoints(cleaned() ?? []);
      await goto(resolve('/'), { invalidateAll: true });
    } finally {
      busy = false;
    }
  }
</script>

<main class="px-safe pb-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
  <div>
    <h1 class="text-h1 text-fg">{firstRun ? 'Connect to your server' : 'Server'}</h1>
    <p class="mt-1 text-caption text-fg-2">
      Enter the address of your self-hosted Overload API, e.g.
      <span class="font-mono text-fg">http://192.168.1.50:3000</span>. Add a second address
      (like a public URL) as a fallback for when you're away. The first one that answers is used.
    </p>
  </div>

  <form
    class="flex flex-col gap-3"
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    {#each urls as _, i}
      <div class="flex items-center gap-2">
        <input
          bind:value={urls[i]}
          oninput={() => ((status = {}), (failedSave = false))}
          placeholder={i === 0 ? 'http://192.168.1.50:3000' : 'https://overload.example.com'}
          inputmode="url"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          class="h-12 min-w-0 flex-1 rounded-sm border border-border bg-surface-2 px-3 font-mono text-caption text-fg placeholder:text-fg-muted"
        />
        <span class="w-5 shrink-0">
          {#if status[i] === 'checking'}
            <LoaderCircle size={20} class="animate-spin text-fg-muted" />
          {:else if status[i] === 'ok'}
            <CircleCheck size={20} class="text-accent" />
          {:else if status[i] === 'fail'}
            <CircleX size={20} class="text-danger" />
          {/if}
        </span>
        {#if urls.length > 1}
          <button
            type="button"
            aria-label="Remove address"
            class="text-fg-muted"
            onclick={() => ((urls = urls.filter((_, j) => j !== i)), (status = {}))}
            ><X size={18} /></button
          >
        {/if}
      </div>
      {#if urls[i] && isMixedContent(normalizeEndpoint(urls[i]) ?? '')}
        <p class="-mt-1 text-caption text-warning">
          This page is HTTPS, so browsers block plain-http addresses. Use an https:// URL.
        </p>
      {/if}
    {/each}

    <button
      type="button"
      class="flex items-center gap-1 self-start text-caption text-accent"
      onclick={() => (urls = [...urls, ''])}><Plus size={16} /> Add fallback address</button
    >

    {#if error}
      <div class="rounded-md bg-danger-soft px-3 py-2 text-caption text-danger">
        <p>{error}</p>
        {#if failedSave}
          <p class="mt-1 text-fg-2">
            Check the address and that the server is running. Its
            <span class="font-mono">CORS_ALLOWED_ORIGINS</span> must include
            <span class="font-mono text-fg">{origin}</span>.
          </p>
        {/if}
      </div>
    {/if}

    <button
      type="submit"
      disabled={busy}
      class="mt-2 h-14 rounded-md bg-accent text-body font-bold text-accent-on disabled:opacity-60"
    >
      {busy ? 'Checking…' : 'Connect'}
    </button>
    {#if failedSave}
      <button type="button" class="text-caption text-fg-2 underline" onclick={() => save(true)}>
        Save anyway
      </button>
    {/if}
    {#if !firstRun}
      <button type="button" class="text-caption text-fg-2" onclick={() => history.back()}>
        Cancel
      </button>
    {/if}
  </form>

  {#if httpsPage}
    <p class="text-caption text-fg-muted">
      Tip: on an HTTPS page, a plain <span class="font-mono">http://</span> LAN address works in
      Chrome (it will ask to allow local network access) but is blocked by Safari and Firefox.
    </p>
  {/if}
</main>
