<script lang="ts">
  import { resolve } from '$app/paths';
  import { authenticate } from '$lib/client/auth';
  import ServerLine from '$lib/components/ServerLine.svelte';

  let code = $state('');
  let username = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = await authenticate('/api/auth/join', {
      code: code.trim(),
      username: username.trim(),
      password
    });
    busy = false;
  }
</script>

<main class="px-safe pb-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
  <div>
    <h1 class="text-h1 text-fg">Join Overload</h1>
    <p class="text-caption text-fg-2">Enter the invite code you were given.</p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-3">
    {#if error}
      <p class="rounded-md bg-danger-soft px-3 py-2 text-caption text-danger">{error}</p>
    {/if}
    <input
      name="code"
      bind:value={code}
      placeholder="INVITE CODE"
      autocomplete="off"
      class="h-12 rounded-sm border border-border bg-surface-2 px-3 font-mono text-body uppercase text-fg placeholder:text-fg-muted"
    />
    <input
      name="username"
      bind:value={username}
      placeholder="Choose a username"
      autocomplete="username"
      autocapitalize="off"
      class="h-12 rounded-sm border border-border bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted"
    />
    <input
      name="password"
      type="password"
      bind:value={password}
      placeholder="Choose a password"
      autocomplete="new-password"
      class="h-12 rounded-sm border border-border bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted"
    />
    <button
      type="submit"
      disabled={busy}
      class="mt-2 h-14 rounded-md bg-accent text-body font-bold text-accent-on disabled:opacity-60"
    >
      {busy ? 'Creating…' : 'Create account'}
    </button>
  </form>

  <p class="text-center text-caption text-fg-2">
    Already have an account? <a href={resolve('/login')} class="font-semibold text-accent">Log in</a>
  </p>
  <ServerLine />
</main>
