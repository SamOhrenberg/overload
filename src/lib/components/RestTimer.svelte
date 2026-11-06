<script lang="ts">
  import { Timer, X } from 'lucide-svelte';

  type Props = { seconds: number; ondone?: () => void };
  let { seconds, ondone }: Props = $props();

  let total = $state(seconds);
  let remaining = $state(seconds);
  let expanded = $state(false);
  let interval: ReturnType<typeof setInterval> | null = null;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

  function stop() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  $effect(() => {
    // Restart whenever a new rest period begins.
    total = seconds;
    remaining = seconds;
    stop();
    interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stop();
        try {
          navigator.vibrate?.([30, 60, 30]);
        } catch {
          /* best-effort */
        }
        ondone?.();
      }
    }, 1000);
    return stop;
  });

  function add(delta: number) {
    remaining = Math.max(0, remaining + delta);
    total = Math.max(total, remaining);
  }
  function skip() {
    stop();
    remaining = 0;
    ondone?.();
  }

  const R = 54;
  const C = 2 * Math.PI * R;
  let progress = $derived(total > 0 ? remaining / total : 0);
  let low = $derived(remaining <= 5 && remaining > 0);
</script>

{#if !expanded}
  <button
    class="flex w-full items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-2 text-fg"
    onclick={() => (expanded = true)}
  >
    <span class="inline-flex items-center gap-2 text-caption text-fg-2">
      <Timer size={16} /> rest
    </span>
    <span class="num text-display-m {low ? 'text-success' : 'text-fg'}">{fmt(remaining)}</span>
    <span class="flex gap-2">
      <span
        class="rounded-full bg-surface-3 px-2 py-1 text-caption"
        role="button"
        tabindex="0"
        onclick={(e) => {
          e.stopPropagation();
          add(30);
        }}
        onkeydown={() => {}}>+30s</span
      >
      <span
        class="rounded-full bg-surface-3 px-2 py-1 text-caption"
        role="button"
        tabindex="0"
        onclick={(e) => {
          e.stopPropagation();
          skip();
        }}
        onkeydown={() => {}}>Skip</span
      >
    </span>
  </button>
{:else}
  <div class="rounded-lg bg-surface p-4 text-center shadow-e3">
    <div class="mb-2 flex justify-end">
      <button aria-label="Collapse timer" onclick={() => (expanded = false)}><X size={20} /></button>
    </div>
    <svg viewBox="0 0 120 120" class="mx-auto h-40 w-40 -rotate-90">
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-3)" stroke-width="8" />
      <circle
        cx="60"
        cy="60"
        r={R}
        fill="none"
        stroke={low ? 'var(--success)' : 'var(--accent)'}
        stroke-width="8"
        stroke-linecap="round"
        stroke-dasharray={C}
        stroke-dashoffset={C * (1 - progress)}
      />
    </svg>
    <div class="num -mt-28 mb-20 text-display-xl text-fg">{fmt(remaining)}</div>
    <div class="flex justify-center gap-3">
      <button class="h-12 flex-1 rounded-md bg-surface-2 font-semibold" onclick={() => add(-15)}
        >−15s</button
      >
      <button class="h-12 flex-1 rounded-md bg-surface-2 font-semibold" onclick={() => add(30)}
        >+30s</button
      >
      <button class="h-12 flex-1 rounded-md bg-accent font-semibold text-accent-on" onclick={skip}
        >Done</button
      >
    </div>
  </div>
{/if}
