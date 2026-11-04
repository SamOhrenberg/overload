<script lang="ts">
  import { Minus, Plus } from 'lucide-svelte';

  export type SetPayload = {
    weight: number | null;
    reps: number;
    rir: number | null;
    isWarmup: boolean;
  };

  type Props = {
    weight?: number;
    reps?: number;
    unit?: 'lb' | 'kg';
    loadIncrement?: number;
    lastWeight?: number | null;
    rir?: number | null;
    bodyweight?: boolean;
    editing?: boolean;
    onlog: (p: SetPayload) => void;
  };

  let {
    weight: weight0 = 0,
    reps: reps0 = 5,
    unit = 'lb',
    loadIncrement = 5,
    lastWeight = null,
    rir: rir0 = 2,
    bodyweight = false,
    editing = false,
    onlog
  }: Props = $props();

  let weight = $state(weight0);
  let reps = $state(reps0);
  let rir = $state<number | null>(rir0);
  let isWarmup = $state(false);

  const rirOptions: (number | null)[] = [0, 1, 2, 3, 4, null];
  const rirLabel = (v: number | null) => (v === null ? '—' : v === 4 ? '4+' : String(v));

  function haptic(ms = 8) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* best-effort */
    }
  }

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  function bump(field: 'weight' | 'reps', dir: 1 | -1) {
    if (field === 'weight') weight = Math.max(0, +(weight + dir * loadIncrement).toFixed(2));
    else reps = Math.max(0, reps + dir);
    haptic();
  }
  function startHold(field: 'weight' | 'reps', dir: 1 | -1) {
    bump(field, dir);
    let delay = 300;
    const tick = () => {
      bump(field, dir);
      delay = Math.max(80, delay - 35);
      holdTimer = setTimeout(tick, delay);
    };
    holdTimer = setTimeout(tick, 400);
  }
  function endHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function logSet() {
    haptic(14);
    onlog({ weight: bodyweight ? null : weight, reps, rir, isWarmup });
    isWarmup = false;
  }
</script>

<div class="rounded-t-xl bg-surface pt-4 pb-safe px-safe shadow-e3">
  <!-- Weight -->
  {#if !bodyweight}
    <div class="mb-3 flex items-center justify-between gap-3">
      <span class="w-16 text-label text-fg-2">Weight</span>
      <button
        class="stepper-btn"
        aria-label="Decrease weight"
        onpointerdown={() => startHold('weight', -1)}
        onpointerup={endHold}
        onpointerleave={endHold}
      >
        <Minus size={24} />
      </button>
      <div class="flex-1 text-center">
        <span class="num text-display-m text-fg">{weight}</span>
        <span class="ml-1 text-caption text-fg-muted">{unit}</span>
        {#if lastWeight !== null && lastWeight !== weight}
          <button
            class="mx-auto block text-caption text-fg-muted underline"
            onclick={() => (weight = lastWeight!)}>last {lastWeight}</button
          >
        {/if}
      </div>
      <button
        class="stepper-btn"
        aria-label="Increase weight"
        onpointerdown={() => startHold('weight', 1)}
        onpointerup={endHold}
        onpointerleave={endHold}
      >
        <Plus size={24} />
      </button>
    </div>
  {/if}

  <!-- Reps -->
  <div class="mb-4 flex items-center justify-between gap-3">
    <span class="w-16 text-label text-fg-2">Reps</span>
    <button
      class="stepper-btn"
      aria-label="Decrease reps"
      onpointerdown={() => startHold('reps', -1)}
      onpointerup={endHold}
      onpointerleave={endHold}
    >
      <Minus size={24} />
    </button>
    <div class="flex-1 text-center"><span class="num text-display-m text-fg">{reps}</span></div>
    <button
      class="stepper-btn"
      aria-label="Increase reps"
      onpointerdown={() => startHold('reps', 1)}
      onpointerup={endHold}
      onpointerleave={endHold}
    >
      <Plus size={24} />
    </button>
  </div>

  <!-- RIR chips -->
  <div class="mb-4">
    <span class="mb-2 block text-label text-fg-2">
      RIR <span class="font-normal text-fg-muted">reps left</span>
    </span>
    <div class="flex gap-2" role="radiogroup" aria-label="Reps in reserve">
      {#each rirOptions as v}
        <button
          role="radio"
          aria-checked={rir === v}
          class="h-11 flex-1 rounded-full text-caption font-semibold transition-colors duration-fast
                 {rir === v ? 'bg-accent text-accent-on' : 'bg-surface-3 text-fg-2'}"
          onclick={() => {
            rir = v;
            haptic();
          }}>{rirLabel(v)}</button
        >
      {/each}
    </div>
  </div>

  <!-- Actions -->
  <div class="flex gap-3 pb-2">
    <button
      class="h-14 rounded-md px-4 text-body font-semibold
             {isWarmup ? 'bg-surface-3 text-fg' : 'border border-border-strong bg-transparent text-fg-2'}"
      aria-pressed={isWarmup}
      onclick={() => (isWarmup = !isWarmup)}>Warm-up</button
    >
    <button
      class="h-14 flex-1 rounded-md bg-accent text-body font-bold text-accent-on transition-transform
             duration-fast active:scale-[.98] active:bg-accent-press"
      onclick={logSet}>{editing ? 'Update set' : 'Log set'}</button
    >
  </div>
</div>

<style>
  .stepper-btn {
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    display: grid;
    place-items: center;
    background: var(--surface-3);
    color: var(--text);
    touch-action: none;
  }
  .stepper-btn:active {
    background: var(--border-strong);
  }
</style>
