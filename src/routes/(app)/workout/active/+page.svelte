<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { X, Plus, ChevronLeft, ChevronRight, Check } from 'lucide-svelte';
  import SetLogger from '$lib/components/SetLogger.svelte';
  import RestTimer from '$lib/components/RestTimer.svelte';
  import GoalChip from '$lib/components/GoalChip.svelte';
  import { api, apiJson } from '$lib/client/api';
  import { send } from '$lib/client/outbox';

  type Goal = 'strength' | 'endurance' | 'stamina';
  type LoggedSet = { weight: number | null; reps: number; rir: number | null; isWarmup: boolean };
  type Entry = {
    id: string;
    exerciseId: string;
    name: string;
    goal: Goal;
    unit: 'lb' | 'kg';
    loadIncrement: number;
    bodyweight: boolean;
    target: { weight: number; reps: number; rir: number | null };
    sets: LoggedSet[];
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
      apiJson<any[]>('/api/recommendations').catch(() => [])
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
      unit: ex.unit === 'kg' ? 'kg' : 'lb',
      loadIncrement: ex.loadIncrement ? Number(ex.loadIncrement) : 5,
      bodyweight: ex.modality === 'bodyweight' || ex.loadIncrement == null,
      target: targetFor(ex),
      sets: []
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

  async function finish() {
    if (!workoutId) return;
    await api(`/api/workouts/${workoutId}`, { method: 'PATCH', body: JSON.stringify({}) });
    goto(`/workout/${workoutId}/summary`);
  }

  let entry = $derived(entries[current]);
  let workingCount = $derived(entry ? entry.sets.filter((s) => !s.isWarmup).length : 0);
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
        <p class="text-caption text-fg-2">
          Target {entry.target.reps} reps{entry.bodyweight
            ? ''
            : ` @ ${entry.target.weight} ${entry.unit}`} · RIR {entry.target.rir}
        </p>
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
          unit={entry.unit}
          loadIncrement={entry.loadIncrement}
          bodyweight={entry.bodyweight}
          lastWeight={entry.bodyweight ? null : entry.target.weight}
          onlog={onLog}
        />
      {/key}
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
