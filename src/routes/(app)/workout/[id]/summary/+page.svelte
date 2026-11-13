<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { Trophy } from 'lucide-svelte';
  import ExerciseCard from '$lib/components/ExerciseCard.svelte';
  import { targetLabel, zoneLabelsFor } from '$lib/format';

  let { data } = $props();

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<header class="pt-safe pb-4 pt-4">
  <h1 class="text-h1 text-fg">{data.title ?? 'Workout'} · done</h1>
  <p class="text-caption text-fg-2">
    {data.exerciseCount} exercises{data.durationMin != null ? ` · ${data.durationMin} min` : ''}
  </p>
</header>

{#each data.runs as run}
  {@const z = zoneLabelsFor(run.name)}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">{run.name} · this run</h2>
  <div class="mb-5 grid grid-cols-3 gap-2 text-center">
    <div class="rounded-lg bg-surface py-3">
      <div class="num text-h2" style="color: var(--goal-strength)">{mmss(run.zones.walkTotalSec)}</div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">{z.walk} total</div>
    </div>
    <div class="rounded-lg bg-surface py-3">
      <div class="num text-h2" style="color: var(--success)">{mmss(run.zones.jogHoldSec)}</div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">{z.jog} hold</div>
    </div>
    <div class="rounded-lg bg-surface py-3">
      <div class="num text-h2" style="color: var(--danger)">
        {run.zones.sprintReps}×{mmss(run.zones.sprintIntervalSec)}
      </div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">{z.sprint}s</div>
    </div>
  </div>
{/each}

{#if data.recommendations.length > 0}
  <h2 class="mb-2 flex items-center gap-2 text-micro uppercase tracking-wide text-fg-muted">
    Next time
  </h2>
  <div class="space-y-3">
    {#each data.recommendations as r (r.id)}
      <ExerciseCard
        name={r.name}
        goal={r.goal}
        target={targetLabel(r.target, r.unit, r.name)}
        rationale={r.rationale}
      />
    {/each}
  </div>
{:else}
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <Trophy size={44} class="text-pr" />
    <p class="text-h2 text-fg">Session logged</p>
    <p class="text-caption text-fg-2">Your next targets are ready on Today.</p>
  </div>
{/if}

<div class="fixed inset-x-0 bottom-20 px-safe">
  <div class="mx-auto max-w-xl">
    <button
      class="h-14 w-full rounded-md bg-accent text-body font-bold text-accent-on"
      onclick={() => goto(resolve('/'))}>Done</button
    >
  </div>
</div>
