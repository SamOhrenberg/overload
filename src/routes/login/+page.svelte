<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
  <h1 class="text-2xl font-bold">Overload</h1>

  <form method="POST" use:enhance class="flex flex-col gap-3">
    {#if form?.error}
      <p class="text-danger text-sm">{form.error}</p>
    {/if}
    <input name="username" placeholder="Username" autocomplete="username" class="rounded border border-border bg-bg-raised p-3" />
    <input name="password" type="password" placeholder="Password" autocomplete="current-password" class="rounded border border-border bg-bg-raised p-3" />
    <button type="submit" class="rounded bg-accent p-3 font-semibold text-bg">Log in</button>
  </form>

  <p class="text-sm text-content-muted">
    Have an invite code? <a href="/join" class="text-accent">Join</a>
  </p>
</main>
