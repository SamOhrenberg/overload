<script lang="ts">
  import { MessageSquareText, X } from 'lucide-svelte';
  import { api } from '$lib/client/api';

  type Comment = {
    id: string;
    targetType: string;
    targetId: string | null;
    body: string;
    author: string;
    createdAt: string;
  };

  let {
    comments,
    title = 'Comments',
    contextFor
  }: {
    comments: Comment[];
    title?: string;
    /** Optional label for what a comment is attached to (e.g. "Bench · Set 2"). */
    contextFor?: (c: Comment) => string | null;
  } = $props();

  let hidden = $state<string[]>([]);
  const visible = $derived(comments.filter((c) => !hidden.includes(c.id)));

  async function dismiss(id: string) {
    hidden = [...hidden, id];
    const res = await api(`/api/comments/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) hidden = hidden.filter((h) => h !== id);
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

{#if visible.length}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">{title}</h2>
  <ul class="mb-6 space-y-2">
    {#each visible as c (c.id)}
      {@const ctx = contextFor?.(c)}
      <li class="rounded-lg bg-surface p-3 shadow-e1">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-1.5 text-caption font-semibold text-fg">
            <MessageSquareText size={14} class="shrink-0 text-accent" />
            <span class="truncate">{c.author}</span>
            <span class="shrink-0 font-normal text-fg-muted">· {fmt(c.createdAt)}</span>
          </span>
          <button
            class="-m-1 shrink-0 p-1 text-fg-muted"
            aria-label="Dismiss comment"
            onclick={() => dismiss(c.id)}><X size={16} /></button
          >
        </div>
        {#if ctx}<p class="mb-1 text-micro uppercase tracking-wide text-fg-muted">{ctx}</p>{/if}
        <p class="whitespace-pre-wrap break-words text-caption text-fg-2">{c.body}</p>
      </li>
    {/each}
  </ul>
{/if}
