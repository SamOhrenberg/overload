<script lang="ts">
  import { resolve } from '$app/paths';
  import { ChevronLeft, Trophy } from 'lucide-svelte';
  import GoalChip from '$lib/components/GoalChip.svelte';
  import { clock, zoneLabelsFor } from '$lib/format';

  let { data } = $props();
  const w = $derived(data.workout);

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  const fmtTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
</script>

<header class="pt-safe pb-3 pt-4">
  <a href={resolve('/history')} class="inline-flex items-center gap-1 text-caption text-fg-2">
    <ChevronLeft size={16} /> History
  </a>
  <h1 class="mt-1 text-h1 text-fg">{w.title ?? 'Workout'}</h1>
  <p class="text-caption text-fg-2">
    {fmtDate(w.startedAt)} · {fmtTime(w.startedAt)}
  </p>
  <p class="mt-1 text-caption text-fg-muted">
    {data.totalSets} set{data.totalSets === 1 ? '' : 's'}{data.durationMin != null
      ? ` · ${data.durationMin} min`
      : ''}{w.sessionRpe ? ` · RPE ${w.sessionRpe}` : ''}
  </p>
</header>

{#if w.notes}
  <p class="mb-4 rounded-lg bg-surface p-3 text-caption text-fg-2">{w.notes}</p>
{/if}

{#if w.entries.length === 0}
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <p class="text-h2 text-fg">No exercises logged</p>
    <p class="text-caption text-fg-2">This session was empty.</p>
  </div>
{:else}
  <div class="space-y-3">
    {#each w.entries as e (e.id)}
      <section class="rounded-lg bg-surface p-4 shadow-e1">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-body-strong text-fg">{e.name}</h2>
          <GoalChip goal={e.goalSnapshot} />
        </div>

        {#if e.cardio}
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-2">
            <span class="num font-mono text-fg">{clock(e.cardio.durationSec)}</span>
            {#if e.cardio.distance != null}
              <span>{e.cardio.distance} {e.unit}</span>
            {/if}
            {#if e.cardio.avgPaceSec != null}
              <span>{clock(e.cardio.avgPaceSec)}/{e.unit}</span>
            {/if}
            {#if e.cardio.avgHr != null}
              <span>{e.cardio.avgHr} bpm</span>
            {/if}
          </div>
          {#if e.cardio.zones}
            {@const z = zoneLabelsFor(e.name)}
            <div class="mt-1 flex flex-wrap gap-x-4 text-caption text-fg-2">
              <span>{z.walk} {clock(e.cardio.zones.walkTotalSec)}</span>
              <span>{z.jog} hold {clock(e.cardio.zones.jogHoldSec)}</span>
              <span>{e.cardio.zones.sprintReps}×{clock(e.cardio.zones.sprintIntervalSec)} {z.sprint.toLowerCase()}</span>
            </div>
          {/if}
        {:else if e.sets.length === 0}
          <p class="text-caption text-fg-muted">No sets logged.</p>
        {:else}
          <ul class="space-y-1">
            {#each e.sets as s, i (s.id)}
              <li
                class="flex items-center justify-between rounded-md px-3 py-1.5 {s.isWarmup
                  ? 'text-fg-muted'
                  : 'bg-bg'}"
              >
                <span class="text-caption text-fg-2">
                  {s.isWarmup ? 'Warmup' : `Set ${i + 1}`}
                </span>
                <span class="num font-mono text-fg">
                  {s.weight != null ? `${s.weight} ${e.unit} × ${s.reps}` : `${s.reps} reps`}
                </span>
                <span class="flex items-center gap-1 text-caption text-fg-2">
                  {#if s.isPr}<Trophy size={13} class="text-pr" />{/if}
                  {s.rir != null ? `RIR ${s.rir}` : ''}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
{/if}
