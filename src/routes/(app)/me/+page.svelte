<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronRight, Download, LogOut } from 'lucide-svelte';
  import { api } from '$lib/client/api';

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

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
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

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Data</h2>
<a
  href="/api/export"
  class="mb-6 flex items-center justify-between rounded-lg bg-surface p-4"
>
  <span class="flex items-center gap-2 text-body text-fg"><Download size={18} /> Export my data</span>
  <ChevronRight size={18} class="text-fg-muted" />
</a>

{#if data.user.role === 'admin'}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Admin</h2>
  <a href="/me/invites" class="mb-6 flex items-center justify-between rounded-lg bg-surface p-4">
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
