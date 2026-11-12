<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<main class="px-safe pb-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
  <div>
    <h1 class="text-h1 text-fg">Join Overload</h1>
    <p class="text-caption text-fg-2">Enter the invite code you were given.</p>
  </div>

  <form method="POST" use:enhance class="flex flex-col gap-3">
    {#if form?.error}
      <p class="rounded-md bg-danger-soft px-3 py-2 text-caption text-danger">{form.error}</p>
    {/if}
    <input
      name="code"
      placeholder="INVITE CODE"
      value={form?.code ?? ''}
      autocomplete="off"
      class="h-12 rounded-sm border border-border bg-surface-2 px-3 font-mono text-body uppercase text-fg placeholder:text-fg-muted"
    />
    <input
      name="username"
      placeholder="Choose a username"
      value={form?.username ?? ''}
      autocomplete="username"
      class="h-12 rounded-sm border border-border bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted"
    />
    <input
      name="password"
      type="password"
      placeholder="Choose a password"
      autocomplete="new-password"
      class="h-12 rounded-sm border border-border bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted"
    />
    <button type="submit" class="mt-2 h-14 rounded-md bg-accent text-body font-bold text-accent-on">
      Create account
    </button>
  </form>

  <p class="text-center text-caption text-fg-2">
    Already have an account? <a href="/login" class="font-semibold text-accent">Log in</a>
  </p>
</main>
