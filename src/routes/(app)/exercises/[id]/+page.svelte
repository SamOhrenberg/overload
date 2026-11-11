<script lang="ts">
  import { ChevronLeft, LifeBuoy } from 'lucide-svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import GoalChip from '$lib/components/GoalChip.svelte';

  let { data } = $props();

  const goalColor: Record<string, string> = {
    strength: 'var(--goal-strength)',
    endurance: 'var(--goal-endurance)',
    stamina: 'var(--goal-stamina)'
  };

  let chartPoints = $derived(
    [...data.points]
      .reverse()
      .filter((p) => p.estimated1RM != null)
      .map((p) => ({ t: new Date(p.performedAt).getTime(), y: p.estimated1RM as number, pr: false }))
  );

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<header class="pt-safe pb-2 pt-4">
  <a href="/exercises" class="inline-flex items-center gap-1 text-caption text-fg-2">
    <ChevronLeft size={16} /> Exercises
  </a>
  <div class="mt-1 flex items-center justify-between">
    <h1 class="text-h1 text-fg">{data.exercise.name}</h1>
    <GoalChip goal={data.goal} />
  </div>
  <p class="text-caption text-fg-muted capitalize">{data.exercise.modality} · {data.exercise.unit}</p>
</header>

{#if data.stall.stalled}
  <div class="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3">
    <LifeBuoy size={18} class="mt-0.5 text-warning" />
    <p class="text-caption text-warning">{data.stall.suggestion}</p>
  </div>
{/if}

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Estimated 1RM</h2>
<TrendChart points={chartPoints} color={goalColor[data.goal]} />

<h2 class="mb-2 mt-6 text-micro uppercase tracking-wide text-fg-muted">History</h2>
<div class="space-y-2">
  {#each data.points as p (p.workoutId)}
    <div class="flex items-center justify-between rounded-md bg-surface px-4 py-3">
      <span class="text-caption text-fg-2">{fmtDate(p.performedAt)}</span>
      <span class="num font-mono text-fg">
        {#if p.topSet}
          {p.topSet.weight != null
            ? `${p.topSet.weight} × ${p.topSet.reps}`
            : `${p.topSet.reps} reps`}
        {:else if p.distance != null}
          {p.distance} {data.exercise.unit}
        {:else}
          —
        {/if}
      </span>
      <span class="text-caption text-fg-muted">
        {p.estimated1RM != null ? `e1RM ${p.estimated1RM}` : ''}
      </span>
    </div>
  {:else}
    <p class="text-caption text-fg-muted">Log this once and your trend starts.</p>
  {/each}
</div>
