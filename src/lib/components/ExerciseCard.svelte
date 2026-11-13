<script lang="ts">
  import { Check } from 'lucide-svelte';
  import GoalChip from './GoalChip.svelte';

  type Goal = 'strength' | 'endurance' | 'stamina';
  type Props = {
    name: string;
    goal?: Goal;
    target: string;
    lastSummary?: string | null;
    rationale?: string | null;
    status?: 'ready' | 'done' | null;
    onaccept?: () => void;
    onadjust?: () => void;
  };
  let {
    name,
    goal = 'strength',
    target,
    lastSummary = null,
    rationale = null,
    status = 'ready',
    onaccept,
    onadjust
  }: Props = $props();

  let expanded = $state(false);

  const bar: Record<Goal, string> = {
    strength: 'border-goal-strength',
    endurance: 'border-goal-endurance',
    stamina: 'border-goal-stamina'
  };
</script>

<div
  class="overflow-hidden rounded-lg border-l-[3px] bg-surface shadow-e1 {bar[goal]} {status ===
  'done'
    ? 'opacity-60'
    : ''}"
>
  <button class="w-full p-4 text-left" onclick={() => (expanded = !expanded)}>
    <div class="flex items-start justify-between gap-2">
      <h3 class="text-h2 text-fg">{name}</h3>
      <GoalChip {goal} />
    </div>

    <div class="num mt-1 text-display-m text-fg">{target}</div>

    <div class="mt-1 flex items-center justify-between">
      {#if lastSummary}
        <span class="font-mono text-caption text-fg-2">Last {lastSummary}</span>
      {:else}
        <span class="text-caption text-fg-muted">First time — set a baseline</span>
      {/if}
      {#if status === 'done'}
        <span class="inline-flex items-center gap-1 text-caption text-success">
          <Check size={14} /> done
        </span>
      {:else if status === 'ready'}
        <span class="text-caption text-fg-muted">ready</span>
      {/if}
    </div>
  </button>

  {#if expanded && (rationale || onaccept || onadjust)}
    <div class="-mt-1 px-4 pb-4">
      {#if rationale}
        <p class="mb-3 text-caption text-fg-2">{rationale}</p>
      {/if}
      {#if onaccept || onadjust}
        <div class="flex gap-2">
          {#if onaccept}
            <button
              class="h-11 flex-1 rounded-md bg-accent text-body font-semibold text-accent-on transition-transform duration-fast active:scale-[.98]"
              onclick={(e) => {
                e.stopPropagation();
                onaccept?.();
              }}>Accept</button
            >
          {/if}
          {#if onadjust}
            <button
              class="h-11 flex-1 rounded-md border border-border-strong bg-surface-2 text-body font-semibold text-fg"
              onclick={(e) => {
                e.stopPropagation();
                onadjust?.();
              }}>Adjust</button
            >
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
