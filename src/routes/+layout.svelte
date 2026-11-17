<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { startOutbox } from '$lib/client/outbox';
  import ActivityBar from '$lib/components/ActivityBar.svelte';
  let { children } = $props();

  onMount(() => {
    // Replay any sets logged while offline; SvelteKit registers the SW itself.
    startOutbox();
    // Apply a pinned theme if the user chose one.
    try {
      const t = localStorage.getItem('overload.theme');
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    } catch {
      /* ignore */
    }
  });
</script>

<ActivityBar />
{@render children()}
