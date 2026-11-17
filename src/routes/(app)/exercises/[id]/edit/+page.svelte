<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ChevronLeft, Archive, Trash2, RotateCcw } from 'lucide-svelte';
  import { apiJson } from '$lib/client/api';
  import ExerciseFields from '$lib/components/ExerciseFields.svelte';
  import {
    CARDIO_METRICS,
    GOALS,
    LOADED_MODALITIES,
    goalDefaults,
    parseLoadStep,
    parseMuscles,
    type ExerciseUnit,
    type Goal,
    type Modality,
    type StaminaMode
  } from '$lib/exercise';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  const ex = data.exercise;
  // svelte-ignore state_referenced_locally
  const savedGoal = data.goal;

  // --- Exercise details (custom exercises only) ---------------------------
  let name = $state(ex.name);
  let modality = $state<Modality>(ex.modality as Modality);
  let unit = $state<ExerciseUnit>(ex.unit as ExerciseUnit);
  let loadIncrement = $state(ex.loadIncrement != null ? String(ex.loadIncrement) : '');
  let defaultGoal = $state<Goal | null>(ex.defaultGoal as Goal | null);
  let muscles = $state(ex.muscleGroups.join(', '));
  let tracksSpeedZones = $state(ex.tracksSpeedZones);

  // --- Training goal (any exercise; per user) -----------------------------
  type Metric = (typeof CARDIO_METRICS)[number];
  const str = (n: number | null | undefined) => (n != null ? String(n) : '');
  let goal = $state<Goal | null>((savedGoal?.goal as Goal) ?? null);
  let staminaMode = $state<StaminaMode>((savedGoal?.staminaMode as StaminaMode) ?? (ex.kind === 'cardio' ? 'cardio' : 'work_capacity'));
  let repLow = $state(str(savedGoal?.repLow));
  let repHigh = $state(str(savedGoal?.repHigh));
  let targetSets = $state(str(savedGoal?.targetSets));
  let targetRir = $state(str(savedGoal?.targetRir));
  let cardioMetric = $state<Metric>((savedGoal?.cardioMetric as Metric) ?? 'distance');

  let fallbackGoal = $derived(defaultGoal ?? 'strength');
  let defaults = $derived(goal ? goalDefaults(goal, staminaMode) : null);
  let usesReps = $derived(goal !== 'stamina' || staminaMode === 'work_capacity');

  function pickGoal(g: Goal | null) {
    if (g === goal) return;
    goal = g;
    // A new goal starts from its own defaults, not the old goal's numbers.
    repLow = repHigh = targetSets = targetRir = '';
  }

  let saving = $state(false);
  let saveError = $state<string | null>(null);

  function goalBody(): Record<string, unknown> {
    const n = (s: string, label: string) => {
      if (!s.trim()) return undefined;
      const v = Number(s);
      if (!Number.isInteger(v) || v < 0) throw new Error(`${label} must be a whole number.`);
      return v;
    };
    const body: Record<string, unknown> = {
      goal,
      targetSets: n(targetSets, 'Sets'),
      targetRir: n(targetRir, 'RIR')
    };
    if (goal === 'stamina') body.staminaMode = staminaMode;
    if (usesReps) {
      body.repLow = n(repLow, 'Rep range');
      body.repHigh = n(repHigh, 'Rep range');
      if ((body.repLow == null) !== (body.repHigh == null)) throw new Error('Fill in both ends of the rep range.');
    } else {
      body.cardioMetric = cardioMetric;
    }
    return body;
  }

  const goalSnapshot = () => (goal ? JSON.stringify(goalBody()) : 'none');
  // svelte-ignore state_referenced_locally
  const initialGoal = goalSnapshot();

  async function save() {
    if (saving || (ex.custom && !name.trim())) return;
    saving = true;
    saveError = null;
    try {
      const nextGoal = goalSnapshot(); // validates before anything is sent
      if (ex.custom) {
        await apiJson(`/api/exercises/${ex.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            modality,
            unit,
            loadIncrement: LOADED_MODALITIES.includes(modality) ? parseLoadStep(loadIncrement) : null,
            defaultGoal,
            muscleGroups: parseMuscles(muscles),
            tracksSpeedZones: modality === 'cardio' && tracksSpeedZones
          })
        });
      }
      if (nextGoal !== initialGoal) {
        if (goal) {
          await apiJson(`/api/exercises/${ex.id}/goal`, { method: 'PUT', body: nextGoal });
        } else {
          await apiJson(`/api/exercises/${ex.id}/goal`, { method: 'DELETE' });
        }
      }
      await goto(resolve(`/exercises/${ex.id}`), { replaceState: true });
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Could not save';
      saving = false;
    }
  }

  async function remove() {
    const msg = data.hasHistory
      ? `Archive “${ex.name}”? It has logged history, so it will be hidden from your library while past workouts keep it. You can restore it later.`
      : `Delete “${ex.name}”? This can’t be undone.`;
    if (!confirm(msg)) return;
    try {
      await apiJson(`/api/exercises/${ex.id}`, { method: 'DELETE' });
      await goto(resolve('/exercises'), { replaceState: true });
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Could not delete';
    }
  }

  async function restore() {
    try {
      await apiJson(`/api/exercises/${ex.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) });
      await goto(resolve(`/exercises/${ex.id}`), { replaceState: true });
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Could not restore';
    }
  }

  const label = 'mb-1 block text-micro uppercase tracking-wide text-fg-muted';
  const input =
    'h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none';
  const pill = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-caption font-semibold capitalize ${on ? 'bg-accent text-accent-on' : 'bg-surface-3 text-fg-2'}`;
</script>

<header class="pt-safe flex items-center gap-1 pb-3 pt-4">
  <a href={resolve(`/exercises/${ex.id}`)} class="-ml-2 p-1 text-fg-muted" aria-label="Back to exercise">
    <ChevronLeft size={24} />
  </a>
  <h1 class="text-h1 text-fg">Edit exercise</h1>
</header>

{#if ex.archived}
  <div class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-warning-soft p-3">
    <p class="text-caption text-warning">Archived — hidden from your library.</p>
    <button
      type="button"
      class="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-caption font-semibold text-fg"
      onclick={restore}
    >
      <RotateCcw size={14} /> Restore
    </button>
  </div>
{/if}

<form
  class="space-y-4"
  onsubmit={(e) => {
    e.preventDefault();
    save();
  }}
>
  {#if ex.custom}
    <ExerciseFields
      bind:name
      bind:modality
      bind:unit
      bind:loadIncrement
      bind:defaultGoal
      bind:muscles
      bind:tracksSpeedZones
    />
  {:else}
    <div class="rounded-lg bg-surface p-4">
      <p class="text-body text-fg">{ex.name}</p>
      <p class="text-caption text-fg-muted">
        <span class="capitalize">{ex.modality}</span> · {ex.unit}{ex.loadIncrement
          ? ` · ${ex.loadIncrement} ${ex.unit} weight steps`
          : ''}
      </p>
      <p class="mt-2 text-caption text-fg-muted">
        Built-in exercises can’t be renamed or retyped — you can still set your own training goal below.
      </p>
    </div>
  {/if}

  <section class="space-y-4 border-t border-border pt-4">
    <div>
      <h2 class="text-h2 text-fg">Your training goal</h2>
      <p class="text-caption text-fg-muted">Drives the rep range and next-session targets for you.</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button type="button" aria-pressed={goal === null} class={pill(goal === null)} onclick={() => pickGoal(null)}>
        Default ({fallbackGoal})
      </button>
      {#each GOALS as g}
        <button type="button" aria-pressed={goal === g} class={pill(goal === g)} onclick={() => pickGoal(g)}>{g}</button>
      {/each}
    </div>

    {#if goal && defaults}
      {#if goal === 'stamina'}
        <div>
          <span class={label}>Stamina style</span>
          <div class="flex gap-1 rounded-md bg-surface-2 p-1">
            {#each [['cardio', 'Cardio'], ['work_capacity', 'High-rep sets']] as [m, text]}
              <button
                type="button"
                aria-pressed={staminaMode === m}
                class="h-9 flex-1 rounded text-caption font-semibold {staminaMode === m ? 'bg-surface text-fg' : 'text-fg-muted'}"
                onclick={() => {
                  staminaMode = m as StaminaMode;
                  repLow = repHigh = targetSets = targetRir = '';
                }}>{text}</button
              >
            {/each}
          </div>
        </div>
      {/if}

      {#if usesReps}
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class={label}>Reps from</span>
            <input bind:value={repLow} inputmode="numeric" placeholder={str(defaults.repLow)} class={input} />
          </label>
          <label class="block">
            <span class={label}>Reps to</span>
            <input bind:value={repHigh} inputmode="numeric" placeholder={str(defaults.repHigh)} class={input} />
          </label>
        </div>
      {:else}
        <div>
          <span class={label}>Progress by</span>
          <div class="flex gap-1 rounded-md bg-surface-2 p-1">
            {#each CARDIO_METRICS as m}
              <button
                type="button"
                aria-pressed={cardioMetric === m}
                class="h-9 flex-1 rounded text-caption font-semibold capitalize {cardioMetric === m ? 'bg-surface text-fg' : 'text-fg-muted'}"
                onclick={() => (cardioMetric = m)}>{m}</button
              >
            {/each}
          </div>
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class={label}>Sets</span>
          <input bind:value={targetSets} inputmode="numeric" placeholder={str(defaults.targetSets)} class={input} />
        </label>
        <label class="block">
          <span class={label}>Reps in reserve</span>
          <input bind:value={targetRir} inputmode="numeric" placeholder={str(defaults.targetRir)} class={input} />
        </label>
      </div>
      <p class="text-caption text-fg-muted">Leave a box blank to use the {goal} default shown.</p>
    {/if}
  </section>

  {#if saveError}
    <p class="text-caption text-danger">{saveError}</p>
  {/if}

  <button
    type="submit"
    class="h-12 w-full rounded-md bg-accent text-body font-semibold text-accent-on disabled:opacity-40"
    disabled={saving || (ex.custom && !name.trim())}
  >
    {saving ? 'Saving…' : 'Save'}
  </button>
</form>

{#if ex.custom && !ex.archived}
  <button
    type="button"
    class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-danger-soft py-3 text-body font-semibold text-danger"
    onclick={remove}
  >
    {#if data.hasHistory}
      <Archive size={18} /> Archive exercise
    {:else}
      <Trash2 size={18} /> Delete exercise
    {/if}
  </button>
{/if}

<!-- Room below the last control so the floating + button never covers it. -->
<div class="h-16" aria-hidden="true"></div>
