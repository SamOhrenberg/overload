<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Target as TargetIcon } from 'lucide-svelte';
  import ExerciseCard from '$lib/components/ExerciseCard.svelte';
  import AdjustSheet from '$lib/components/AdjustSheet.svelte';
  import { send } from '$lib/client/outbox';
  import type { TargetRow } from './+page.server';

  let { data } = $props();

  let view = $state<'due' | 'all'>('due');
  let showAll = $state(false);
  let adjustRow = $state<TargetRow | null>(null);

  const EXPANDED = 5;
  let visibleAll = $derived(showAll ? data.all : data.all.slice(0, EXPANDED));

  function since(iso: string | null): string {
    if (!iso) return 'Never trained';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return 'Trained today';
    if (days === 1) return 'Trained yesterday';
    return `Trained ${days} days ago`;
  }
  const isStale = (iso: string | null) =>
    !iso || Date.now() - new Date(iso).getTime() > 10 * 86_400_000;

  async function accept(row: TargetRow) {
    if (!row.recId) return;
    await send('/api/recommendations', { id: row.recId, status: 'accepted' }, 'PATCH');
    await invalidateAll();
  }

  async function saveAdjust(target: Record<string, unknown>) {
    const row = adjustRow;
    adjustRow = null;
    if (!row?.recId) return;
    await send('/api/recommendations', { id: row.recId, target }, 'PATCH');
    await invalidateAll();
  }
</script>

<header class="pt-safe pb-3 pt-4">
  <h1 class="text-h1 text-fg">Targets</h1>
</header>

<div class="mb-4 flex gap-1 rounded-full bg-surface-2 p-1">
  {#each [['due', 'Due'], ['all', 'All']] as [key, label]}
    <button
      class="h-9 flex-1 rounded-full text-caption font-semibold {view === key
        ? 'bg-accent text-accent-on'
        : 'text-fg-2'}"
      onclick={() => (view = key as 'due' | 'all')}>{label}</button
    >
  {/each}
</div>

{#if view === 'due'}
  {#if data.due.length}
    <div class="space-y-3">
      {#each data.due as row (row.exerciseId)}
        <div>
          <p class="mb-1 pl-1 text-micro uppercase tracking-wide {isStale(row.lastPerformed) ? 'text-warning' : 'text-fg-muted'}">
            {since(row.lastPerformed)}
          </p>
          <ExerciseCard
            name={row.name}
            goal={row.goal}
            target={row.target}
            lastSummary={row.lastSummary}
            rationale={row.rationale}
            onaccept={row.recId ? () => accept(row) : undefined}
            onadjust={row.recId ? () => (adjustRow = row) : undefined}
          />
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex flex-col items-center gap-3 py-16 text-center">
      <TargetIcon size={44} class="text-on-surface-faint" />
      <p class="text-h2 text-fg">Nothing due yet</p>
      <p class="text-caption text-fg-2">
        Once you’ve trained a grouped exercise at least once, it’ll show up here by how long
        it’s been. Set up groups in <a href="/routines" class="text-accent underline">Routines</a>.
      </p>
    </div>
  {/if}
{:else if data.all.length}
  <div class="space-y-3">
    {#each visibleAll as row (row.exerciseId)}
      <ExerciseCard
        name={row.name}
        goal={row.goal}
        target={row.target}
        lastSummary={row.lastSummary}
        rationale={row.rationale}
        onaccept={row.recId ? () => accept(row) : undefined}
        onadjust={row.recId ? () => (adjustRow = row) : undefined}
      />
    {/each}
  </div>
  {#if data.all.length > EXPANDED}
    <button
      class="mt-3 w-full rounded-md border border-border bg-surface py-3 text-caption font-semibold text-fg-2"
      onclick={() => (showAll = !showAll)}
    >
      {showAll ? 'Show fewer' : `All targets (${data.all.length})`}
    </button>
  {/if}
{:else}
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <TargetIcon size={44} class="text-on-surface-faint" />
    <p class="text-h2 text-fg">No targets yet</p>
    <p class="text-caption text-fg-2">Log a workout and your next targets land here.</p>
  </div>
{/if}

{#if adjustRow}
  <AdjustSheet
    name={adjustRow.name}
    unit={adjustRow.unit}
    rawTarget={adjustRow.rawTarget}
    onclose={() => (adjustRow = null)}
    onsave={saveAdjust}
  />
{/if}
