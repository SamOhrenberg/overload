<script lang="ts">
  import { resolve } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { ChevronLeft, Plus, Copy } from 'lucide-svelte';
  import { apiJson, api } from '$lib/client/api';

  let { data } = $props();
  let newCode = $state<string | null>(null);

  async function create() {
    const invite = await apiJson<{ code: string }>('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ maxUses: 1 })
    });
    newCode = invite.code;
    await invalidateAll();
  }

  async function revoke(id: string) {
    await api(`/api/invites/${id}`, { method: 'DELETE' });
    await invalidateAll();
  }

  function copy() {
    if (newCode) navigator.clipboard?.writeText(newCode);
  }
</script>

<header class="pt-safe pb-2 pt-4">
  <a href={resolve('/me')} class="inline-flex items-center gap-1 text-caption text-fg-2">
    <ChevronLeft size={16} /> Me
  </a>
  <div class="mt-1 flex items-center justify-between">
    <h1 class="text-h1 text-fg">Invites</h1>
    <button
      class="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-caption font-semibold text-accent-on"
      onclick={create}
    >
      <Plus size={16} /> New
    </button>
  </div>
</header>

{#if newCode}
  <div class="mb-4 rounded-lg bg-accent-soft p-4">
    <p class="text-caption text-fg-2">New code — you won't see it again:</p>
    <div class="mt-1 flex items-center justify-between">
      <span class="num font-mono text-h2 text-fg">{newCode}</span>
      <button class="inline-flex items-center gap-1 text-caption text-accent" onclick={copy}>
        <Copy size={16} /> Copy
      </button>
    </div>
  </div>
{/if}

<div class="space-y-2">
  {#each data.invites as inv (inv.id)}
    <div class="flex items-center justify-between rounded-lg bg-surface p-4 shadow-e1">
      <div>
        <p class="text-body text-fg">{inv.note ?? 'Invite'}</p>
        <p class="text-caption text-fg-2">
          {inv.uses}/{inv.maxUses} used ·
          <span
            class={inv.status === 'active'
              ? 'text-success'
              : inv.status === 'expired'
                ? 'text-warning'
                : 'text-fg-muted'}>{inv.status}</span
          >
        </p>
      </div>
      {#if inv.status === 'active'}
        <button class="text-caption font-semibold text-danger" onclick={() => revoke(inv.id)}>
          Revoke
        </button>
      {/if}
    </div>
  {:else}
    <p class="py-8 text-center text-caption text-fg-muted">
      No invites yet. Create one to invite your training circle.
    </p>
  {/each}
</div>
