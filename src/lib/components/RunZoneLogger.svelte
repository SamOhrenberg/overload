<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Play, Pause, Trash2, Plus, Flag } from 'lucide-svelte';

  type Zone = 'walk' | 'jog' | 'sprint';
  type Segment = { zone: Zone; durationSec: number };
  export type RunPayload = {
    segments: Segment[];
    durationSec: number;
    distance: number | null;
  };

  type Props = {
    unit?: string;
    target?: { jog?: { holdSec?: number }; sprint?: { intervalSec?: number; reps?: number } } | null;
    labels?: { walk: string; jog: string; sprint: string };
    onlog: (p: RunPayload) => void;
  };

  let { unit = 'mi', target = null, labels = { walk: 'Walk', jog: 'Jog', sprint: 'Sprint' }, onlog }: Props =
    $props();

  const ZONES: Zone[] = ['walk', 'jog', 'sprint'];
  let ZONE_LABEL = $derived<Record<Zone, string>>(labels);
  const ZONE_COLOR: Record<Zone, string> = {
    walk: 'var(--goal-strength)',
    jog: 'var(--success)',
    sprint: 'var(--danger)'
  };
  const ZONE_SOFT: Record<Zone, string> = {
    walk: 'var(--goal-strength-soft)',
    jog: 'var(--accent-soft)',
    sprint: 'var(--danger-soft)'
  };

  let segments = $state<Segment[]>([]);
  let activeZone = $state<Zone | null>(null);
  let activeStart = $state(0);
  let now = $state(Date.now());
  let distance = $state<number | null>(null);

  // Manual add
  let manualZone = $state<Zone>('jog');
  let manualMin = $state(0);
  let manualSec = $state(30);

  let timer: ReturnType<typeof setInterval> | null = null;
  function ensureTicking() {
    if (!timer) timer = setInterval(() => (now = Date.now()), 250);
  }
  onDestroy(() => timer && clearInterval(timer));

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s)) % 60).padStart(2, '0')}`;

  function haptic(ms = 10) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* best-effort */
    }
  }

  let activeElapsed = $derived(activeZone ? Math.floor((now - activeStart) / 1000) : 0);

  function commitActive() {
    if (!activeZone) return;
    const dur = Math.max(1, Math.round((Date.now() - activeStart) / 1000));
    segments.push({ zone: activeZone, durationSec: dur });
    activeZone = null;
  }

  /** Tap a zone: switch to it (committing the current one), or pause if it's active. */
  function tapZone(zone: Zone) {
    haptic(14);
    if (activeZone === zone) {
      commitActive(); // tapping the live zone = pause/stop it
      return;
    }
    if (activeZone) commitActive();
    activeZone = zone;
    activeStart = Date.now();
    now = Date.now();
    ensureTicking();
  }

  function removeSegment(i: number) {
    segments.splice(i, 1);
    haptic();
  }

  function addManual() {
    const dur = manualMin * 60 + manualSec;
    if (dur <= 0) return;
    segments.push({ zone: manualZone, durationSec: dur });
    haptic();
  }

  // Live per-zone rollups (including the active segment).
  let rollup = $derived.by(() => {
    const live = [...segments];
    if (activeZone && activeElapsed > 0) live.push({ zone: activeZone, durationSec: activeElapsed });
    const by = (z: Zone) => live.filter((s) => s.zone === z);
    const sum = (z: Zone) => by(z).reduce((n, s) => n + s.durationSec, 0);
    const longest = (z: Zone) => by(z).reduce((m, s) => Math.max(m, s.durationSec), 0);
    return {
      total: live.reduce((n, s) => n + s.durationSec, 0),
      jogHold: longest('jog'),
      jogTotal: sum('jog'),
      sprintReps: by('sprint').length,
      sprintTotal: sum('sprint'),
      walkTotal: sum('walk')
    };
  });

  let canFinish = $derived(segments.length > 0 || activeZone != null);

  function finish() {
    if (activeZone) commitActive();
    if (!segments.length) return;
    haptic(18);
    onlog({
      segments: [...segments],
      durationSec: segments.reduce((n, s) => n + s.durationSec, 0),
      distance
    });
    segments = [];
    distance = null;
  }
</script>

<div class="rounded-t-xl bg-surface pt-4 pb-safe px-safe shadow-e3">
  <!-- Target to beat -->
  {#if target && (target.jog?.holdSec || target.sprint?.reps)}
    <p class="mb-3 text-center text-caption text-fg-2">
      Target:
      {#if target.jog?.holdSec}<span class="text-fg"
          >{ZONE_LABEL.jog.toLowerCase()} {fmt(target.jog.holdSec)}</span
        >{/if}
      {#if target.jog?.holdSec && target.sprint?.reps} · {/if}
      {#if target.sprint?.reps && target.sprint?.intervalSec}<span class="text-fg"
          >{target.sprint.reps}×{fmt(target.sprint.intervalSec)} {ZONE_LABEL.sprint.toLowerCase()}</span
        >{/if}
    </p>
  {/if}

  <!-- Live clocks -->
  <div class="mb-3 flex items-end justify-center gap-6">
    <div class="text-center">
      <div class="num text-display-m text-fg">{fmt(rollup.total)}</div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">Total</div>
    </div>
    <div class="text-center" style="color: {activeZone ? ZONE_COLOR[activeZone] : 'var(--text-muted)'}">
      <div class="num text-display-m">{activeZone ? fmt(activeElapsed) : '0:00'}</div>
      <div class="text-micro uppercase tracking-wide">
        {activeZone ? `${ZONE_LABEL[activeZone]} — live` : 'paused'}
      </div>
    </div>
  </div>

  <!-- Zone buttons -->
  <div class="mb-3 grid grid-cols-3 gap-2">
    {#each ZONES as z}
      {@const active = activeZone === z}
      <button
        class="flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border-2 font-semibold transition-transform duration-fast active:scale-[.97]"
        style="border-color: {ZONE_COLOR[z]};
               background: {active ? ZONE_COLOR[z] : ZONE_SOFT[z]};
               color: {active ? 'var(--surface)' : ZONE_COLOR[z]}"
        aria-pressed={active}
        onclick={() => tapZone(z)}
      >
        <span class="flex items-center gap-1 text-body">
          {#if active}<Pause size={16} />{:else}<Play size={14} />{/if}
          {ZONE_LABEL[z]}
        </span>
      </button>
    {/each}
  </div>

  <!-- Per-zone rollup -->
  <div class="mb-3 grid grid-cols-3 gap-2 text-center">
    <div class="rounded-md bg-surface-2 py-2">
      <div class="num text-body text-fg">{fmt(rollup.walkTotal)}</div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">{ZONE_LABEL.walk} total</div>
    </div>
    <div class="rounded-md bg-surface-2 py-2">
      <div class="num text-body text-fg">{fmt(rollup.jogHold)}</div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">{ZONE_LABEL.jog} hold</div>
    </div>
    <div class="rounded-md bg-surface-2 py-2">
      <div class="num text-body text-fg">{rollup.sprintReps} × {fmt(rollup.sprintTotal)}</div>
      <div class="text-micro uppercase tracking-wide text-fg-muted">{ZONE_LABEL.sprint}s</div>
    </div>
  </div>

  <!-- Segment list (editable) -->
  {#if segments.length}
    <div class="mb-3 max-h-32 space-y-1 overflow-y-auto">
      {#each segments as s, i}
        <div class="flex items-center justify-between rounded-md bg-surface-2 px-3 py-1.5">
          <span
            class="rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wide"
            style="background: {ZONE_SOFT[s.zone]}; color: {ZONE_COLOR[s.zone]}"
            >{ZONE_LABEL[s.zone]}</span
          >
          <span class="num font-mono text-fg">{fmt(s.durationSec)}</span>
          <button aria-label="Remove segment" class="text-fg-muted" onclick={() => removeSegment(i)}>
            <Trash2 size={15} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Manual add -->
  <details class="mb-3">
    <summary class="cursor-pointer text-caption text-fg-2">Add a segment manually</summary>
    <div class="mt-2 flex items-center gap-2">
      <select
        class="h-10 rounded-md border border-border bg-surface-2 px-2 text-caption text-fg"
        bind:value={manualZone}
      >
        {#each ZONES as z}<option value={z}>{ZONE_LABEL[z]}</option>{/each}
      </select>
      <input
        type="number"
        min="0"
        aria-label="Minutes"
        class="h-10 w-14 rounded-md border border-border bg-surface-2 px-2 text-center num text-fg"
        bind:value={manualMin}
      />
      <span class="text-fg-muted">:</span>
      <input
        type="number"
        min="0"
        max="59"
        aria-label="Seconds"
        class="h-10 w-14 rounded-md border border-border bg-surface-2 px-2 text-center num text-fg"
        bind:value={manualSec}
      />
      <button
        class="ml-auto flex h-10 items-center gap-1 rounded-md bg-surface-3 px-3 text-caption font-semibold text-fg"
        onclick={addManual}><Plus size={15} /> Add</button
      >
    </div>
  </details>

  <!-- Optional distance -->
  <div class="mb-3 flex items-center gap-2">
    <label for="run-distance" class="text-label text-fg-2">Distance</label>
    <input
      id="run-distance"
      type="number"
      min="0"
      step="0.01"
      inputmode="decimal"
      placeholder="optional"
      class="h-10 w-24 rounded-md border border-border bg-surface-2 px-2 text-center num text-fg"
      bind:value={distance}
    />
    <span class="text-caption text-fg-muted">{unit}</span>
  </div>

  <!-- Finish -->
  <div class="pb-2">
    <button
      class="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-accent text-body font-bold text-accent-on transition-transform duration-fast active:scale-[.98] disabled:opacity-40"
      disabled={!canFinish}
      onclick={finish}
    >
      <Flag size={18} /> Finish run
    </button>
  </div>
</div>
