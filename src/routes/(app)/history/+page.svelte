<script lang="ts">
  import { ChartColumn } from 'lucide-svelte';
  let { data } = $props();

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
</script>

<header class="pt-safe pb-3 pt-4">
  <h1 class="text-h1 text-fg">History</h1>
</header>

{#if data.workouts.length === 0}
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <ChartColumn size={48} class="text-on-surface-faint" />
    <p class="text-h2 text-fg">No sessions yet</p>
    <p class="text-caption text-fg-2">Your first workout will show up here.</p>
  </div>
{:else}
  <div class="space-y-2">
    {#each data.workouts as w (w.id)}
      <div class="flex items-center justify-between rounded-lg bg-surface p-4 shadow-e1">
        <div>
          <p class="text-body-strong text-fg">{w.title ?? 'Workout'}</p>
          <p class="text-caption text-fg-2">{fmtDate(w.startedAt)}</p>
        </div>
        {#if w.sessionRpe}
          <span class="text-caption text-fg-muted">RPE {w.sessionRpe}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}
