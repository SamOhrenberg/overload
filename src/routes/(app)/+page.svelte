<script lang="ts">
  let { data } = $props();
</script>

<header class="pt-safe pb-2 pt-4">
  <h1 class="text-h1 text-fg">Today</h1>
  <p class="text-caption text-fg-2">Welcome back, {data.user.username}.</p>
</header>

<p class="text-body text-fg-2">Your plan will appear here.</p>
