<script lang="ts">
  import { resolve } from '$app/paths';
  import { ChevronLeft, LifeBuoy, Plus, Pencil } from 'lucide-svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import GoalChip from '$lib/components/GoalChip.svelte';
  import CommentList from '$lib/components/CommentList.svelte';
  import { zoneLabelsFor, groupColorVar } from '$lib/format';
  import { send } from '$lib/client/outbox';

  let { data } = $props();

  let z = $derived(zoneLabelsFor(data.exercise.name));

  // Which groups this exercise belongs to (toggleable from here — the mirror of
  // editing membership from the Routines screen).
  let memberOf = $state<string[]>(data.memberOf);
  function toggleGroup(groupId: string) {
    const member = !memberOf.includes(groupId);
    memberOf = member ? [...memberOf, groupId] : memberOf.filter((g) => g !== groupId);
    void send(
      `/api/groups/${groupId}/members`,
      { exerciseId: data.exercise.id, member },
      'PUT'
    );
  }

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

  // Running speed zones: separate jog-base and sprint-interval trends.
  let zonePoints = $derived([...data.points].reverse().filter((p) => p.zones != null));
  let jogHoldSeries = $derived(
    zonePoints.map((p) => ({ t: new Date(p.performedAt).getTime(), y: p.zones!.jogHoldSec, pr: false }))
  );
  let sprintSeries = $derived(
    zonePoints.map((p) => ({
      t: new Date(p.performedAt).getTime(),
      y: p.zones!.sprintIntervalSec,
      pr: false
    }))
  );
  let lastZones = $derived(zonePoints.length ? zonePoints[zonePoints.length - 1].zones : null);

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<header class="pt-safe pb-2 pt-4">
  <a href={resolve('/exercises')} class="inline-flex items-center gap-1 text-caption text-fg-2">
    <ChevronLeft size={16} /> Exercises
  </a>
  <div class="mt-1 flex items-center justify-between gap-2">
    <h1 class="text-h1 text-fg">{data.exercise.name}</h1>
    <div class="flex shrink-0 items-center gap-2">
      <GoalChip goal={data.goal} />
      <a
        href={resolve(`/exercises/${data.exercise.id}/edit`)}
        class="inline-flex items-center gap-1 rounded-full bg-surface-3 px-3 py-1.5 text-caption font-semibold text-fg-2"
        aria-label="Edit exercise"
      >
        <Pencil size={14} /> Edit
      </a>
    </div>
  </div>
  <p class="text-caption text-fg-muted capitalize">{data.exercise.modality} · {data.exercise.unit}</p>
</header>

{#if data.stall.stalled}
  <div class="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3">
    <LifeBuoy size={18} class="mt-0.5 text-warning" />
    <p class="text-caption text-warning">{data.stall.suggestion}</p>
  </div>
{/if}

<CommentList comments={data.comments} />

<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Groups</h2>
{#if data.groups.length}
  <div class="mb-6 flex flex-wrap gap-2">
    {#each data.groups as g (g.id)}
      {@const on = memberOf.includes(g.id)}
      <button
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-semibold {on
          ? 'text-fg'
          : 'text-fg-muted'}"
        style="border-color: {on ? groupColorVar(g.color) : 'var(--border)'}"
        onclick={() => toggleGroup(g.id)}
      >
        <span class="h-2 w-2 rounded-full" style="background: {groupColorVar(g.color)}; opacity: {on ? 1 : 0.4}"></span>
        {g.name}
      </button>
    {/each}
  </div>
{:else}
  <a href={resolve('/routines')} class="mb-6 flex items-center gap-1 text-caption text-accent">
    <Plus size={14} /> Create a group to organize your routines
  </a>
{/if}

{#if data.exercise.tracksSpeedZones}
  {#if lastZones}
    <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Last run</h2>
    <div class="mb-6 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-lg bg-surface py-3">
        <div class="num text-h2" style="color: var(--goal-strength)">{mmss(lastZones.walkTotalSec)}</div>
        <div class="text-micro uppercase tracking-wide text-fg-muted">{z.walk}</div>
      </div>
      <div class="rounded-lg bg-surface py-3">
        <div class="num text-h2" style="color: var(--success)">{mmss(lastZones.jogHoldSec)}</div>
        <div class="text-micro uppercase tracking-wide text-fg-muted">{z.jog} hold</div>
      </div>
      <div class="rounded-lg bg-surface py-3">
        <div class="num text-h2" style="color: var(--danger)">
          {lastZones.sprintReps}×{mmss(lastZones.sprintIntervalSec)}
        </div>
        <div class="text-micro uppercase tracking-wide text-fg-muted">{z.sprint}s</div>
      </div>
    </div>
  {/if}

  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Longest continuous {z.jog.toLowerCase()}</h2>
  <TrendChart points={jogHoldSeries} color="var(--success)" />

  <h2 class="mb-2 mt-6 text-micro uppercase tracking-wide text-fg-muted">{z.sprint} interval length</h2>
  <TrendChart points={sprintSeries} color="var(--danger)" />
{:else}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Estimated 1RM</h2>
  <TrendChart points={chartPoints} color={goalColor[data.goal]} />
{/if}

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
        {:else if p.zones}
          {z.jog.toLowerCase()} {mmss(p.zones.jogHoldSec)} · {p.zones.sprintReps}×{mmss(p.zones.sprintIntervalSec)}
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
