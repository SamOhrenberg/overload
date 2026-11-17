<script lang="ts">
  import {
    LOADED_MODALITIES,
    MODALITIES,
    defaultLoadIncrement,
    unitsFor,
    type ExerciseUnit,
    type Goal,
    type Modality
  } from '$lib/exercise';

  /** Name, type, unit, load step, default goal and muscles — shared by New and Edit. */
  let {
    name = $bindable(''),
    modality = $bindable<Modality>('barbell'),
    unit = $bindable<ExerciseUnit>('lb'),
    loadIncrement = $bindable(''),
    defaultGoal = $bindable<Goal | null>(null),
    muscles = $bindable(''),
    tracksSpeedZones = $bindable(false),
    autofocus = false
  }: {
    name?: string;
    modality?: Modality;
    unit?: ExerciseUnit;
    loadIncrement?: string;
    defaultGoal?: Goal | null;
    muscles?: string;
    tracksSpeedZones?: boolean;
    autofocus?: boolean;
  } = $props();

  const goals: (Goal | null)[] = [null, 'strength', 'endurance', 'stamina'];

  let units = $derived(unitsFor(modality));
  let loaded = $derived(LOADED_MODALITIES.includes(modality));

  // Keep the unit valid when switching type.
  $effect(() => {
    if (!units.includes(unit)) unit = units[0];
  });
</script>

<label class="block">
  <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Name</span>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    bind:value={name}
    maxlength="80"
    required
    {autofocus}
    placeholder="e.g. Incline Dumbbell Press"
    class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
  />
</label>

<div>
  <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Type</span>
  <div class="flex flex-wrap gap-2">
    {#each MODALITIES as m}
      <button
        type="button"
        aria-pressed={modality === m}
        class="rounded-full px-3 py-1.5 text-caption font-semibold capitalize {modality === m
          ? 'bg-accent text-accent-on'
          : 'bg-surface-3 text-fg-2'}"
        onclick={() => (modality = m)}>{m}</button
      >
    {/each}
  </div>
  <span class="mt-1 block text-caption text-fg-muted">
    {loaded
      ? 'Sets are logged with weight × reps.'
      : modality === 'cardio'
        ? 'Logged as time and distance.'
        : 'Sets are logged as reps only (no weight).'}
  </span>
</div>

<div class="grid grid-cols-2 gap-3">
  <div>
    <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Unit</span>
    <div class="flex gap-1 rounded-md bg-surface-2 p-1">
      {#each units as u}
        <button
          type="button"
          aria-pressed={unit === u}
          class="h-9 flex-1 rounded text-caption font-semibold {unit === u ? 'bg-surface text-fg' : 'text-fg-muted'}"
          onclick={() => (unit = u)}>{u}</button
        >
      {/each}
    </div>
  </div>
  {#if loaded}
    <label class="block">
      <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Weight step ({unit})</span>
      <input
        bind:value={loadIncrement}
        inputmode="decimal"
        placeholder={String(defaultLoadIncrement(unit))}
        class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
      />
    </label>
  {/if}
</div>

{#if modality === 'cardio'}
  <label class="flex items-center justify-between rounded-md bg-surface-2 px-3 py-3">
    <span>
      <span class="block text-body text-fg">Speed zones</span>
      <span class="block text-caption text-fg-muted">Log walk / jog / sprint segments</span>
    </span>
    <input type="checkbox" bind:checked={tracksSpeedZones} class="h-5 w-5 accent-[var(--accent)]" />
  </label>
{/if}

<div>
  <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Default goal</span>
  <div class="flex flex-wrap gap-2">
    {#each goals as g}
      <button
        type="button"
        aria-pressed={defaultGoal === g}
        class="rounded-full px-3 py-1.5 text-caption font-semibold capitalize {defaultGoal === g
          ? 'bg-accent text-accent-on'
          : 'bg-surface-3 text-fg-2'}"
        onclick={() => (defaultGoal = g)}>{g ?? 'None'}</button
      >
    {/each}
  </div>
</div>

<label class="block">
  <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Muscle groups</span>
  <input
    bind:value={muscles}
    placeholder="chest, triceps"
    class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
  />
  <span class="mt-1 block text-caption text-fg-muted">Optional, comma-separated.</span>
</label>
