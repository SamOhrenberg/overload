<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { X, Plus, ChevronLeft, ChevronRight, Check } from 'lucide-svelte';
  import SetLogger from '$lib/components/SetLogger.svelte';
  import RunZoneLogger from '$lib/components/RunZoneLogger.svelte';
  import type { RunPayload } from '$lib/components/RunZoneLogger.svelte';
  import RestTimer from '$lib/components/RestTimer.svelte';
  import GoalChip from '$lib/components/GoalChip.svelte';
  import { api, apiJson } from '$lib/client/api';
  import { send, flush } from '$lib/client/outbox';
  import { zoneLabelsFor } from '$lib/format';

  type Goal = 'strength' | 'endurance' | 'stamina';
  type LoggedSet = { weight: number | null; reps: number; rir: number | null; isWarmup: boolean };
  type CardioTarget = {
    jog?: { holdSec?: number };
    sprint?: { intervalSec?: number; reps?: number };
  } | null;
  type Entry = {
    id: string;
    exerciseId: string;
    name: string;
    goal: Goal;
    unit: string;
    loadIncrement: number;
    bodyweight: boolean;
    kind: 'resistance' | 'cardio' | 'mobility';
    tracksSpeedZones: boolean;
    target: { weight: number; reps: number; rir: number | null };
    cardioTarget: CardioTarget;
    sets: LoggedSet[];
    bouts: RunPayload[];
  };

  let workoutId = $state<string | null>(null);
  let entries = $state<Entry[]>([]);
  let current = $state(0);
  let library = $state<any[]>([]);
  let recs = $state<Record<string, any>>({});
  let pickerOpen = $state(false);
  let resting = $state(false);
  let restKey = $state(0);
  let elapsed = $state(0);
  let startedAt = Date.now();

  const fmtClock = (s: number) =>
    `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  onMount(() => {
    void init();
    const t = setInterval(() => (elapsed = Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  });

  async function init() {
    const [w, lib, pending] = await Promise.all([
      apiJson<any>('/api/workouts', { method: 'POST', body: JSON.stringify({}) }),
      apiJson<any[]>('/api/exercises'),
      apiJson<any[]>('/api/recommendations?scope=prefill').catch(() => [])
    ]);
    workoutId = w.id;
    startedAt = new Date(w.startedAt).getTime();
    library = lib;
    for (const r of pending) recs[r.exerciseId] = r;
  }

  function targetFor(ex: any): Entry['target'] {
    const t = recs[ex.id]?.target ?? {};
    return {
      weight: typeof t.weight === 'number' ? t.weight : 0,
      reps: typeof t.reps === 'number' ? t.reps : (t.repLow ?? 8),
      rir: typeof t.rir === 'number' ? t.rir : 2
    };
  }

  function cardioTargetFor(ex: any): CardioTarget {
    const t = recs[ex.id]?.target;
    if (!t || t.metric !== 'run_zones') return null;
    return { jog: t.jog, sprint: t.sprint };
  }

  async function addExercise(ex: any) {
    pickerOpen = false;
    if (!workoutId) return;
    const goal: Goal = (ex.defaultGoal as Goal) ?? 'strength';
    const row = await apiJson<any>(`/api/workouts/${workoutId}`, {
      method: 'POST',
      body: JSON.stringify({ exerciseId: ex.id, goalSnapshot: goal, orderIndex: entries.length })
    });
    entries.push({
      id: row.id,
      exerciseId: ex.id,
      name: ex.name,
      goal,
      unit: ex.unit ?? 'lb',
      loadIncrement: ex.loadIncrement ? Number(ex.loadIncrement) : 5,
      bodyweight: ex.modality === 'bodyweight' || ex.loadIncrement == null,
      kind: ex.kind ?? 'resistance',
      tracksSpeedZones: !!ex.tracksSpeedZones,
      target: targetFor(ex),
      cardioTarget: cardioTargetFor(ex),
      sets: [],
      bouts: []
    });
    current = entries.length - 1;
  }

  async function onLog(payload: LoggedSet) {
    const entry = entries[current];
    if (!entry) return;
    entry.sets.push(payload); // optimistic
    void send('/api/sets', { workoutExerciseId: entry.id, ...payload });
    if (!payload.isWarmup) {
      resting = true;
      restKey += 1;
    }
  }

  async function onLogBout(payload: RunPayload) {
    const entry = entries[current];
    if (!entry) return;
    entry.bouts.push(payload); // optimistic
    void send('/api/cardio', {
      workoutExerciseId: entry.id,
      durationSec: payload.durationSec,
      distance: payload.distance,
      segments: payload.segments
    });
  }

  const zoneSummary = (b: RunPayload, name: string) => {
    const z = zoneLabelsFor(name);
    const sum = (zone: string) =>
      b.segments.filter((s) => s.zone === zone).reduce((n, s) => n + s.durationSec, 0);
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const sprints = b.segments.filter((s) => s.zone === 'sprint').length;
    return `${mmss(b.durationSec)} · ${z.jog.toLowerCase()} ${mmss(sum('jog'))} · ${sprints} ${z.sprint.toLowerCase()}`;
  };

  async function finish() {
    if (!workoutId) return;
    // Only log a session that actually tracked something. If no sets were
    // recorded, discard the empty workout instead of cluttering history.
    const tracked = entries.some((e) => e.sets.length > 0 || e.bouts.length > 0);
    if (!tracked) {
      await api(`/api/workouts/${workoutId}`, { method: 'DELETE' }).catch(() => {});
      goto(resolve('/'));
      return;
    }
    // Drain any queued sets/bouts first so the end-of-workout recommendation is
    // computed from writes that have actually reached the server (a run logged
    // while the server was mid-redeploy would otherwise look like "no data").
    await flush();
    await api(`/api/workouts/${workoutId}`, { method: 'PATCH', body: JSON.stringify({}) });
    goto(resolve(`/workout/${workoutId}/summary`));
  }

  let entry = $derived(entries[current]);
  let workingCount = $derived(entry ? entry.sets.filter((s) => !s.isWarmup).length : 0);
  let isZonedCardio = $derived(!!entry && entry.kind === 'cardio' && entry.tracksSpeedZones);
  let zoneLabels = $derived(
    entry ? zoneLabelsFor(entry.name) : { walk: 'Walk', jog: 'Jog', sprint: 'Sprint' }
  );

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="flex min-h-dvh flex-col">
  <!-- Header -->
  <header class="pt-safe px-1 pt-3">
    <div class="flex items-center justify-between">
      <button aria-label="Finish workout" onclick={finish}><X size={24} /></button>
      <span class="text-caption text-fg-2">Workout</span>
      <span class="num text-metric font-mono text-fg-2">{fmtClock(elapsed)}</span>
    </div>
  </header>

  {#if !entry}
    <!-- Empty: pick the first exercise -->
    <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p class="text-h2 text-fg">Add your first exercise</p>
      <p class="text-caption text-fg-2">Pick from your library to start logging.</p>
      <button
        class="h-12 rounded-md bg-accent px-6 font-semibold text-accent-on"
        onclick={() => (pickerOpen = true)}>Add exercise</button
      >
    </div>
  {:else}
    <!-- Current exercise header -->
    <div class="flex items-center justify-between px-4 pt-4">
      <button
        aria-label="Previous exercise"
        disabled={current === 0}
        onclick={() => (current = Math.max(0, current - 1))}
        class="disabled:opacity-30"><ChevronLeft size={22} /></button
      >
      <div class="text-center">
        <div class="flex items-center justify-center gap-2">
          <h2 class="text-h1 text-fg">{entry.name}</h2>
          <GoalChip goal={entry.goal} />
        </div>
        {#if isZonedCardio}
          <p class="text-caption text-fg-2">
            {#if entry.cardioTarget?.jog?.holdSec || entry.cardioTarget?.sprint?.reps}
              Target{#if entry.cardioTarget?.jog?.holdSec}
                {zoneLabels.jog.toLowerCase()} {mmss(entry.cardioTarget.jog.holdSec)}{/if}{#if entry.cardioTarget?.jog?.holdSec && entry.cardioTarget?.sprint?.reps} ·{/if}{#if entry.cardioTarget?.sprint?.reps && entry.cardioTarget?.sprint?.intervalSec}
                {entry.cardioTarget.sprint.reps}×{mmss(entry.cardioTarget.sprint.intervalSec)} {zoneLabels.sprint.toLowerCase()}{/if}
            {:else}
              Tap {zoneLabels.walk} / {zoneLabels.jog} / {zoneLabels.sprint} as you go
            {/if}
          </p>
        {:else}
          <p class="text-caption text-fg-2">
            Target {entry.target.reps} reps{entry.bodyweight
              ? ''
              : ` @ ${entry.target.weight} ${entry.unit}`} · RIR {entry.target.rir}
          </p>
        {/if}
      </div>
      <button
        aria-label="Next exercise"
        disabled={current >= entries.length - 1}
        onclick={() => (current = Math.min(entries.length - 1, current + 1))}
        class="disabled:opacity-30"><ChevronRight size={22} /></button
      >
    </div>

    <!-- Logged sets -->
    <div class="flex-1 space-y-2 overflow-y-auto p-4">
      {#each entry.bouts as b, i}
        <div class="flex items-center justify-between rounded-md bg-surface px-4 py-2">
          <span class="text-caption text-fg-2">Run {i + 1}</span>
          <span class="num font-mono text-fg">{zoneSummary(b, entry.name)}</span>
          <Check size={16} class="text-success" />
        </div>
      {/each}
      {#each entry.sets as s, i}
        <div
          class="flex items-center justify-between rounded-md bg-surface px-4 py-2 {s.isWarmup
            ? 'border border-dashed border-border text-fg-muted'
            : ''}"
        >
          <span class="text-caption text-fg-2">{s.isWarmup ? 'W' : `Set ${i + 1}`}</span>
          <span class="num font-mono text-fg">
            {s.weight != null ? `${s.weight} × ${s.reps}` : `${s.reps} reps`}
          </span>
          <span class="text-caption text-fg-2">{s.rir != null ? `RIR ${s.rir}` : ''}</span>
          <Check size={16} class="text-success" />
        </div>
      {/each}
      <button
        class="flex w-full items-center justify-center gap-1 py-2 text-caption text-fg-2"
        onclick={() => (pickerOpen = true)}
      >
        <Plus size={16} /> Add exercise
      </button>
    </div>

    <!-- Thumb zone -->
    <div class="sticky bottom-0">
      {#if isZonedCardio}
        {#key `${entry.id}-${entry.bouts.length}`}
          <RunZoneLogger
            unit={entry.unit}
            target={entry.cardioTarget}
            labels={zoneLabels}
            onlog={onLogBout}
          />
        {/key}
      {:else}
        {#if resting}
          <div class="px-safe pb-2">
            {#key restKey}
              <RestTimer seconds={entry.goal === 'endurance' ? 75 : 120} ondone={() => (resting = false)} />
            {/key}
          </div>
        {/if}
        {#key `${entry.id}-${entry.sets.length}`}
          <SetLogger
            weight={entry.target.weight}
            reps={entry.target.reps}
            rir={entry.target.rir}
            unit={entry.unit === 'kg' ? 'kg' : 'lb'}
            loadIncrement={entry.loadIncrement}
            bodyweight={entry.bodyweight}
            lastWeight={entry.bodyweight ? null : entry.target.weight}
            onlog={onLog}
          />
        {/key}
      {/if}
    </div>
  {/if}
</div>

<!-- Exercise picker -->
{#if pickerOpen}
  <div
    class="fixed inset-0 z-50 flex flex-col justify-end"
    style="background: var(--scrim)"
    role="button"
    tabindex="0"
    onclick={() => (pickerOpen = false)}
    onkeydown={() => {}}
  >
    <div
      class="max-h-[70vh] overflow-y-auto rounded-t-xl bg-surface p-4 pb-safe"
      role="dialog"
      aria-label="Pick an exercise"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong"></div>
      <h3 class="mb-2 text-h2 text-fg">Add exercise</h3>
      {#each library as ex}
        <button
          class="flex w-full items-center justify-between border-b border-border py-3 text-left"
          onclick={() => addExercise(ex)}
        >
          <span class="text-body text-fg">{ex.name}</span>
          {#if ex.defaultGoal}<GoalChip goal={ex.defaultGoal} />{/if}
        </button>
      {/each}
    </div>
  </div>
{/if}
