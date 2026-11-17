<script lang="ts">
  import { navigating } from '$app/stores';
  import { fade } from 'svelte/transition';
  import { activity } from '$lib/client/activity.svelte';

  /**
   * App-wide "something is happening" feedback, so taps never look ignored on a
   * slow network: a thin progress bar while a page is loading or a request is in
   * flight, a "still working" note when it drags on, and a short notice when the
   * server couldn't be reached.
   */

  // Don't flash the bar for requests that finish almost instantly.
  const SHOW_AFTER_MS = 150;
  const SLOW_AFTER_MS = 4000;
  const FAILED_FOR_MS = 4000;

  let busy = $derived(!!$navigating || activity.inflight > 0);
  let visible = $state(false);
  let slow = $state(false);

  $effect(() => {
    if (!busy) {
      visible = false;
      slow = false;
      return;
    }
    const show = setTimeout(() => (visible = true), SHOW_AFTER_MS);
    const drag = setTimeout(() => (slow = true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(drag);
    };
  });

  let failed = $state(false);
  let seenFailures = activity.failures;
  $effect(() => {
    if (activity.failures === seenFailures) return;
    seenFailures = activity.failures;
    failed = true;
    const t = setTimeout(() => (failed = false), FAILED_FOR_MS);
    return () => clearTimeout(t);
  });
</script>

{#if visible}
  <div
    class="pointer-events-none fixed inset-x-0 z-[100] h-[3px] overflow-hidden"
    style="top: env(safe-area-inset-top)"
    role="progressbar"
    aria-label="Loading"
    transition:fade={{ duration: 150 }}
  >
    <div class="activity-bar h-full bg-accent"></div>
  </div>
{/if}

{#if (visible && slow) || failed}
  <div
    class="pointer-events-none fixed inset-x-0 z-[100] flex justify-center px-4"
    style="top: max(0.75rem, env(safe-area-inset-top))"
    aria-live="polite"
    transition:fade={{ duration: 150 }}
  >
    <span
      class="rounded-full px-3 py-1.5 text-caption font-semibold shadow-e1 {failed && !(visible && slow)
        ? 'bg-warning-soft text-warning'
        : 'bg-surface-2 text-fg-2'}"
    >
      {#if visible && slow}
        Slow connection — still working…
      {:else}
        Couldn’t reach the server
      {/if}
    </span>
  </div>
{/if}

<style>
  .activity-bar {
    width: 40%;
    animation: activity-slide 1.1s ease-in-out infinite;
  }
  @keyframes activity-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(250%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .activity-bar {
      width: 100%;
      animation: activity-pulse 1.4s ease-in-out infinite;
    }
    @keyframes activity-pulse {
      50% {
        opacity: 0.35;
      }
    }
  }
</style>
