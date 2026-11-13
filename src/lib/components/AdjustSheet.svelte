<script lang="ts">
  import { zoneLabelsFor } from '$lib/format';

  type Target = Record<string, any>;
  type Props = {
    name: string;
    unit?: string;
    rawTarget: Target | null;
    onclose: () => void;
    onsave: (target: Target) => void;
  };
  let { name, unit = 'lb', rawTarget, onclose, onsave }: Props = $props();

  const t: Target = rawTarget ?? {};
  const z = zoneLabelsFor(name);

  // Pick an editor shape from the stored target.
  const isZones = t.metric === 'run_zones';
  const isDistance = !isZones && (t.metric === 'distance' || t.distance != null);
  const isDuration = !isZones && !isDistance && t.durationSec != null && t.weight == null;

  // Resistance
  let weight = $state<number>(typeof t.weight === 'number' ? t.weight : 0);
  let reps = $state<number>(typeof t.reps === 'number' ? t.reps : (t.repLow ?? 8));
  // Distance / duration
  let distance = $state<number>(typeof t.distance === 'number' ? t.distance : 0);
  let durationMin = $state<number>(t.durationSec != null ? Math.round(t.durationSec / 60) : 20);
  // Run zones
  let jogMin = $state<number>(Math.floor((t.jog?.holdSec ?? 0) / 60));
  let jogSec = $state<number>((t.jog?.holdSec ?? 0) % 60);
  let sprintReps = $state<number>(t.sprint?.reps ?? 4);
  let sprintMin = $state<number>(Math.floor((t.sprint?.intervalSec ?? 0) / 60));
  let sprintSec = $state<number>((t.sprint?.intervalSec ?? 0) % 60);

  function save() {
    let next: Target;
    if (isZones) {
      next = {
        ...t,
        metric: 'run_zones',
        jog: { ...(t.jog ?? {}), holdSec: jogMin * 60 + jogSec },
        sprint: {
          ...(t.sprint ?? {}),
          reps: Math.max(0, Math.round(sprintReps)),
          intervalSec: sprintMin * 60 + sprintSec
        }
      };
      delete next.note; // no longer a baseline once edited
    } else if (isDistance) {
      next = { ...t, metric: 'distance', distance: Number(distance) };
    } else if (isDuration) {
      next = { ...t, durationSec: Math.max(0, Math.round(durationMin * 60)) };
    } else {
      next = { ...t, weight: Number(weight), reps: Math.max(1, Math.round(reps)) };
    }
    onsave(next);
  }

  const num = 'h-11 w-20 rounded-md bg-surface-2 text-center text-body text-fg focus:outline-none';
</script>

<div
  class="fixed inset-0 z-50 flex flex-col justify-end"
  style="background: var(--scrim)"
  role="button"
  tabindex="0"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
>
  <div
    class="rounded-t-xl bg-surface p-4 pb-safe"
    role="dialog"
    aria-label="Adjust target"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
  >
    <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong"></div>
    <h3 class="mb-1 text-h2 text-fg">Adjust target</h3>
    <p class="mb-4 text-caption text-fg-2">{name}</p>

    {#if isZones}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-body text-fg">{z.jog} hold</span>
          <div class="flex items-center gap-1">
            <input class={num} type="number" inputmode="numeric" min="0" bind:value={jogMin} />
            <span class="text-fg-2">m</span>
            <input class={num} type="number" inputmode="numeric" min="0" max="59" bind:value={jogSec} />
            <span class="text-fg-2">s</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-body text-fg">{z.sprint} reps</span>
          <input class={num} type="number" inputmode="numeric" min="0" bind:value={sprintReps} />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-body text-fg">{z.sprint} interval</span>
          <div class="flex items-center gap-1">
            <input class={num} type="number" inputmode="numeric" min="0" bind:value={sprintMin} />
            <span class="text-fg-2">m</span>
            <input class={num} type="number" inputmode="numeric" min="0" max="59" bind:value={sprintSec} />
            <span class="text-fg-2">s</span>
          </div>
        </div>
      </div>
    {:else if isDistance}
      <div class="flex items-center justify-between">
        <span class="text-body text-fg">Distance ({unit})</span>
        <input class={num} type="number" inputmode="decimal" min="0" step="0.1" bind:value={distance} />
      </div>
    {:else if isDuration}
      <div class="flex items-center justify-between">
        <span class="text-body text-fg">Duration (min)</span>
        <input class={num} type="number" inputmode="numeric" min="0" bind:value={durationMin} />
      </div>
    {:else}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-body text-fg">Weight ({unit})</span>
          <input class={num} type="number" inputmode="decimal" min="0" step="0.5" bind:value={weight} />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-body text-fg">Reps</span>
          <input class={num} type="number" inputmode="numeric" min="1" bind:value={reps} />
        </div>
      </div>
    {/if}

    <div class="mt-5 flex gap-2">
      <button
        class="h-11 flex-1 rounded-md border border-border-strong bg-surface-2 text-body font-semibold text-fg"
        onclick={onclose}>Cancel</button
      >
      <button
        class="h-11 flex-1 rounded-md bg-accent text-body font-semibold text-accent-on active:scale-[.98]"
        onclick={save}>Save</button
      >
    </div>
  </div>
</div>
