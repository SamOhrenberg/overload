<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { ChevronRight, Download, LogOut, CalendarCog, Dumbbell, Server, MessageSquare, Plug, Copy, Check } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { api, getEndpoints, setToken } from '$lib/client/api';
  import { clearDataCache } from '$lib/client/load';
  import CommentList from '$lib/components/CommentList.svelte';

  let { data } = $props();
  let theme = $state<'dark' | 'light' | 'auto'>('auto');

  // MCP: apps (e.g. Claude) connected over OAuth, and their general notes.
  type Connection = { clientId: string; name: string; scopes: string[]; lastAuthorized: string };
  let mcpUrl = $state<string | null>(null);
  let connections = $state<Connection[]>([]);
  let notes = $state<
    { id: string; targetType: string; targetId: string | null; body: string; author: string; createdAt: string }[]
  >([]);
  let copied = $state(false);

  async function loadConnections() {
    try {
      const [c, n] = await Promise.all([
        api('/api/connections').then((r) => (r.ok ? r.json() : null)),
        api('/api/comments?targetType=general&limit=20').then((r) => (r.ok ? r.json() : []))
      ]);
      if (c) {
        mcpUrl = c.mcpUrl;
        connections = c.connections;
      }
      notes = n;
    } catch {
      /* offline — section stays hidden */
    }
  }

  async function disconnect(c: Connection) {
    if (!confirm(`Disconnect ${c.name}? It will lose access until you authorize it again.`)) return;
    const res = await api(`/api/connections/${encodeURIComponent(c.clientId)}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) connections = connections.filter((x) => x.clientId !== c.clientId);
  }

  async function copyMcpUrl() {
    if (!mcpUrl) return;
    try {
      await navigator.clipboard.writeText(mcpUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked — the URL is visible to copy by hand */
    }
  }

  onMount(() => {
    void loadConnections();
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

{#if mcpUrl}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Connected apps</h2>
  <div class="mb-6 space-y-3 rounded-lg bg-surface p-4">
    <p class="flex items-start gap-2 text-caption text-fg-2">
      <Plug size={16} class="mt-0.5 shrink-0" />
      <span>Add this MCP server URL in Claude (or another MCP client) to let it read your training data
        and leave comments. You'll sign in to approve it.</span>
    </p>
    <button
      class="flex w-full items-center justify-between gap-2 rounded-sm bg-surface-2 px-3 py-2 text-left"
      onclick={copyMcpUrl}
    >
      <span class="min-w-0 truncate font-mono text-caption text-fg">{mcpUrl}</span>
      {#if copied}<Check size={16} class="shrink-0 text-success" />{:else}<Copy size={16} class="shrink-0 text-fg-muted" />{/if}
    </button>
    {#each connections as c (c.clientId)}
      <div class="flex items-center justify-between gap-2 border-t border-border pt-3">
        <div class="min-w-0">
          <p class="truncate text-body text-fg">{c.name}</p>
          <p class="text-caption text-fg-muted">
            {c.scopes.join(' · ')} · since {new Date(c.lastAuthorized).toLocaleDateString()}
          </p>
        </div>
        <button class="shrink-0 text-caption font-semibold text-danger" onclick={() => disconnect(c)}>
          Disconnect
        </button>
      </div>
    {/each}
  </div>
  <CommentList comments={notes} title="Notes from connected apps" />
{/if}

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Help</h2>
<a href={resolve('/feedback')} class="mb-6 flex items-center justify-between rounded-lg bg-surface p-4">
  <span class="flex items-center gap-2 text-body text-fg"><MessageSquare size={18} /> Feedback</span>
  <ChevronRight size={18} class="text-fg-muted" />
</a>

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
