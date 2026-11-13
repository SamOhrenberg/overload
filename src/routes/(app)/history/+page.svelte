<script lang="ts">
  import { onMount } from 'svelte';
  import { ChartColumn, ChevronRight, RefreshCw, Trash2, CloudOff, Check } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/client/api';
  import { peek, retry, discard, type OutboxItem, type RetryResult } from '$lib/client/outbox';
  import SwipeRow from '$lib/components/SwipeRow.svelte';

  let { data } = $props();
  let workouts = $state(data.workouts);

  // --- Pending sync (offline outbox) ---
  let pending = $state<OutboxItem[]>([]);
  let retrying = $state(false);
  let results = $state<Record<string, RetryResult>>({});
  let expanded = $state<string | null>(null);

  async function loadPending() {
    pending = await peek();
  }
  onMount(loadPending);

  function summarize(item: OutboxItem): string {
    let body: any = {};
    try {
      body = JSON.parse(item.body);
    } catch {
      /* ignore */
    }
    if (item.path === '/api/cardio') {
      const segs = Array.isArray(body.segments) ? body.segments.length : 0;
      const dur = typeof body.durationSec === 'number' ? body.durationSec : 0;
      const sprints = Array.isArray(body.segments)
        ? body.segments.filter((s: any) => s.zone === 'sprint').length
        : 0;
      return `Run · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')} · ${segs} segments · ${sprints} sprint`;
    }
    if (item.path === '/api/sets') {
      return `Set · ${body.reps ?? '?'} reps${body.weight != null ? ` @ ${body.weight}` : ''}`;
    }
    return `${item.method} ${item.path}`;
  }

  async function retryAll() {
    retrying = true;
    try {
      const res = await retry();
      results = Object.fromEntries(res.map((r) => [r.id, r]));
      await loadPending();
    } finally {
      retrying = false;
    }
  }

  async function removePending(id: string) {
    await discard(id);
    await loadPending();
  }

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  async function remove(id: string) {
    const prev = workouts;
    workouts = workouts.filter((w) => w.id !== id); // optimistic
    try {
      const res = await api(`/api/workouts/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
    } catch {
      workouts = prev; // restore on failure
    }
  }
</script>

<header class="pt-safe pb-3 pt-4">
  <h1 class="text-h1 text-fg">History</h1>
</header>

<!-- Pending sync: writes queued offline that haven't reached the server yet -->
<section class="mb-4 rounded-lg border border-border bg-surface p-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <CloudOff size={16} class={pending.length ? 'text-warning' : 'text-fg-muted'} />
      <span class="text-caption text-fg-2">
        {pending.length ? `${pending.length} pending to sync` : 'All changes synced'}
      </span>
    </div>
    <div class="flex items-center gap-3">
      <button class="text-caption text-fg-muted" onclick={loadPending} aria-label="Refresh">
        Refresh
      </button>
      {#if pending.length}
        <button
          class="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-caption font-semibold text-accent-on disabled:opacity-50"
          disabled={retrying}
          onclick={retryAll}
        >
          <RefreshCw size={14} class={retrying ? 'animate-spin' : ''} /> Retry now
        </button>
      {/if}
    </div>
  </div>

  {#if pending.length}
    <ul class="mt-3 space-y-2">
      {#each pending as item (item.id)}
        {@const r = results[item.id]}
        <li class="rounded-md bg-surface-2 p-2">
          <div class="flex items-center justify-between gap-2">
            <button
              class="min-w-0 flex-1 text-left"
              onclick={() => (expanded = expanded === item.id ? null : item.id)}
            >
              <span class="block truncate text-caption text-fg">{summarize(item)}</span>
              {#if r}
                <span
                  class="text-micro {r.ok ? 'text-success' : 'text-danger'}"
                >
                  {r.ok ? 'sent ✓' : r.error ? `unreachable (${r.error})` : `rejected ${r.status}`}
                </span>
              {/if}
            </button>
            <button aria-label="Discard" class="text-fg-muted" onclick={() => removePending(item.id)}>
              <Trash2 size={15} />
            </button>
          </div>
          {#if expanded === item.id}
            <pre class="mt-2 max-h-48 overflow-auto rounded bg-surface-3 p-2 text-micro text-fg-2">{JSON.stringify(
                JSON.parse(item.body),
                null,
                2
              )}</pre>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="mt-2 text-micro text-fg-muted">
      Tap a row to inspect the raw payload, or discard it if it's wrong.
    </p>
  {:else}
    <div class="mt-1 flex items-center gap-1 text-micro text-fg-muted">
      <Check size={12} class="text-success" /> Nothing waiting — everything is on the server.
    </div>
  {/if}
</section>

{#if workouts.length === 0}
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <ChartColumn size={48} class="text-on-surface-faint" />
    <p class="text-h2 text-fg">No sessions yet</p>
    <p class="text-caption text-fg-2">Your first workout will show up here.</p>
  </div>
{:else}
  <p class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Swipe a session to delete</p>
  <div class="space-y-2">
    {#each workouts as w (w.id)}
      <SwipeRow ondelete={() => remove(w.id)} ontap={() => goto(`/workout/${w.id}`)}>
        <div class="flex items-center justify-between bg-surface p-4 shadow-e1">
          <div>
            <p class="text-body-strong text-fg">{w.title ?? 'Workout'}</p>
            <p class="text-caption text-fg-2">{fmtDate(w.startedAt)}</p>
          </div>
          <div class="flex items-center gap-2">
            {#if w.sessionRpe}
              <span class="text-caption text-fg-muted">RPE {w.sessionRpe}</span>
            {/if}
            <ChevronRight size={18} class="text-on-surface-faint" />
          </div>
        </div>
      </SwipeRow>
    {/each}
  </div>
{/if}
