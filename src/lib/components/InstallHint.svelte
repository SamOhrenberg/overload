<script lang="ts">
  import { onMount } from 'svelte';
  import { Share, X } from 'lucide-svelte';

  let show = $state(false);

  onMount(() => {
    try {
      const dismissed = localStorage.getItem('overload.installHintDismissed');
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        (navigator as unknown as { standalone?: boolean }).standalone ||
        window.matchMedia('(display-mode: standalone)').matches;
      if (isIOS && !standalone && !dismissed) show = true;
    } catch {
      /* ignore */
    }
  });

  function dismiss() {
    show = false;
    try {
      localStorage.setItem('overload.installHintDismissed', '1');
    } catch {
      /* ignore */
    }
  }
</script>

{#if show}
  <div class="fixed inset-x-0 bottom-24 z-50 px-safe">
    <div class="mx-auto flex max-w-xl items-center gap-3 rounded-md bg-surface-2 p-3 shadow-e4">
      <Share size={20} class="shrink-0 text-accent" />
      <p class="flex-1 text-caption text-fg-2">
        Install Overload: tap <span class="text-fg">Share</span> then
        <span class="text-fg">Add to Home Screen</span>.
      </p>
      <button aria-label="Dismiss" onclick={dismiss}><X size={18} class="text-fg-muted" /></button>
    </div>
  </div>
{/if}
