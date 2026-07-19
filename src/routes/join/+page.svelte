<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
  <h1 class="text-2xl font-bold">Join Overload</h1>

  <form method="POST" use:enhance class="flex flex-col gap-3">
    {#if form?.error}
      <p class="text-danger text-sm">{form.error}</p>
    {/if}
    <input name="code" placeholder="Invite code" value={form?.code ?? ''} class="rounded border border-border bg-bg-raised p-3 uppercase" />
    <input name="username" placeholder="Choose a username" value={form?.username ?? ''} autocomplete="username" class="rounded border border-border bg-bg-raised p-3" />
    <input name="password" type="password" placeholder="Choose a password" autocomplete="new-password" class="rounded border border-border bg-bg-raised p-3" />
    <button type="submit" class="rounded bg-accent p-3 font-semibold text-bg">Create account</button>
  </form>

  <p class="text-sm text-content-muted">
    Already have an account? <a href="/login" class="text-accent">Log in</a>
  </p>
</main>
