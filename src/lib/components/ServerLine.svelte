<script lang="ts">
  import { resolve } from '$app/paths';
  import { getEndpoints } from '$lib/client/api';

  // Only worth showing when the API lives somewhere other than this origin.
  const endpoints = getEndpoints().filter(Boolean);
</script>

{#if endpoints.length}
  <p class="text-center text-caption text-fg-muted">
    Server: <span class="font-mono">{endpoints[0].replace(/^https?:\/\//, '')}</span>{#if endpoints.length > 1}
      +{endpoints.length - 1}{/if} ·
    <a href={resolve('/connect')} class="text-fg-2 underline">Change</a>
  </p>
{/if}
