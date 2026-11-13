<script lang="ts">
  import { page } from '$app/stores';
  import TabBar from '$lib/components/TabBar.svelte';
  import InstallHint from '$lib/components/InstallHint.svelte';
  let { children } = $props();

  // Active Workout is a full-screen takeover — hide the tab bar there.
  let fullscreen = $derived($page.url.pathname.startsWith('/workout/active'));
</script>

<div class="min-h-dvh bg-bg">
  <main class="px-safe mx-auto max-w-xl {fullscreen ? '' : 'pb-24'}">
    {@render children()}
  </main>
  {#if !fullscreen}
    <TabBar />
    <InstallHint />
  {/if}
</div>
