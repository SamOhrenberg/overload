<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { ChevronRight, Download, LogOut, CalendarCog, Dumbbell, Server } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { api, getEndpoints, setToken } from '$lib/client/api';
  import { clearDataCache } from '$lib/client/load';

  let { data } = $props();
  let theme = $state<'dark' | 'light' | 'auto'>('auto');

  onMount(() => {
    try {
      theme = (localStorage.getItem('overload.theme') as typeof theme) ?? 'auto';
    } catch {
      /* ignore */
    }
  });

  function setTheme(t: 'dark' | 'light' | 'auto') {
    theme = t;
    try {
      localStorage.setItem('overload.theme', t);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
  }

  // '' = same-origin (UI served by the API itself).
  const endpoints = getEndpoints().map((e) => e || 'This server');

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    // Drop cached screen data so the next user can't see it offline.
    await clearDataCache();
    await goto(resolve('/login'), { invalidateAll: true });
  }

  // A plain link can't carry the bearer token (or reach a cross-origin API's
  // cookie), so fetch the export and hand the browser a file.
  let exporting = $state(false);
  async function exportData() {
    exporting = true;
    try {
      const res = await api('/api/export');
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'overload-export.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed');
    } finally {
      exporting = false;
    }
  }
</script>

<header class="pt-safe pb-3 pt-4">
  <h1 class="text-h1 text-fg">Me</h1>
</header>

<div class="mb-6 rounded-lg bg-surface p-4 shadow-e1">
  <p class="text-body-strong text-fg">{data.user.username}</p>
  <p class="text-caption text-fg-2 capitalize">{data.user.role}</p>
</div>

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Preferences</h2>
<div class="mb-6 space-y-3 rounded-lg bg-surface p-4">
  <div class="flex items-center justify-between">
    <span class="text-body text-fg">Theme</span>
    <div class="flex gap-1 rounded-full bg-surface-2 p-1">
      {#each ['dark', 'light', 'auto'] as t}
        <button
          class="rounded-full px-3 py-1 text-caption font-semibold capitalize {theme === t
            ? 'bg-accent text-accent-on'
            : 'text-fg-2'}"
          onclick={() => setTheme(t as 'dark' | 'light' | 'auto')}>{t}</button
        >
      {/each}
    </div>
  </div>
  <div class="flex items-center justify-between">
    <span class="text-body text-fg">Units</span>
    <span class="text-caption text-fg-muted">{data.user.defaultUnit}</span>
  </div>
</div>

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Training</h2>
<div class="mb-6 space-y-2">
  <a href={resolve('/routines')} class="flex items-center justify-between rounded-lg bg-surface p-4">
    <span class="flex items-center gap-2 text-body text-fg"><CalendarCog size={18} /> Routines</span>
    <ChevronRight size={18} class="text-fg-muted" />
  </a>
  <a href={resolve('/exercises')} class="flex items-center justify-between rounded-lg bg-surface p-4">
    <span class="flex items-center gap-2 text-body text-fg"><Dumbbell size={18} /> Exercises</span>
    <ChevronRight size={18} class="text-fg-muted" />
  </a>
</div>

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Data</h2>
<button
  class="mb-6 flex w-full items-center justify-between rounded-lg bg-surface p-4 disabled:opacity-60"
  disabled={exporting}
  onclick={exportData}
>
  <span class="flex items-center gap-2 text-body text-fg"
    ><Download size={18} /> {exporting ? 'Exporting…' : 'Export my data'}</span
  >
  <ChevronRight size={18} class="text-fg-muted" />
</button>

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Server</h2>
<a href={resolve('/connect')} class="mb-6 flex items-center justify-between rounded-lg bg-surface p-4">
  <span class="flex min-w-0 items-center gap-2 text-body text-fg">
    <Server size={18} class="shrink-0" />
    <span class="truncate">{endpoints.join(' · ')}</span>
  </span>
  <ChevronRight size={18} class="shrink-0 text-fg-muted" />
</a>

{#if data.user.role === 'admin'}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Admin</h2>
  <a href={resolve('/me/invites')} class="mb-6 flex items-center justify-between rounded-lg bg-surface p-4">
    <span class="text-body text-fg">Invites</span>
    <ChevronRight size={18} class="text-fg-muted" />
  </a>
{/if}

<button
  class="flex w-full items-center justify-center gap-2 py-3 text-body font-semibold text-danger"
  onclick={logout}
>
  <LogOut size={18} /> Log out
</button>
<p class="mt-2 text-center text-caption text-fg-muted">Overload · self-hosted</p>
