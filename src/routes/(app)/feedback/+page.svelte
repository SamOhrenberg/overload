<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Bug, Lightbulb, MessageSquare, ExternalLink, MessageCircle, RefreshCw, Check } from 'lucide-svelte';
  import { apiJson } from '$lib/client/api';
  import type { FeedbackItem, FeedbackComment } from '$lib/server/services/feedback';

  type Kind = 'bug' | 'idea' | 'other';
  type Tab = 'submit' | 'mine';

  const kinds: { id: Kind; label: string; icon: typeof Bug }[] = [
    { id: 'bug', label: 'Bug', icon: Bug },
    { id: 'idea', label: 'Idea', icon: Lightbulb },
    { id: 'other', label: 'Other', icon: MessageSquare }
  ];

  // Tab lives in the URL so "back" and reloads land on the same one.
  let tab = $derived<Tab>($page.url.searchParams.get('tab') === 'mine' ? 'mine' : 'submit');
  function setTab(t: Tab) {
    const url = new URL($page.url);
    if (t === 'mine') url.searchParams.set('tab', 'mine');
    else url.searchParams.delete('tab');
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }

  // --- Submit -------------------------------------------------------------
  let kind = $state<Kind>('bug');
  let title = $state('');
  let body = $state('');
  let includeDevice = $state(true);
  let sending = $state(false);
  let sendError = $state<string | null>(null);
  let sentNotice = $state<string | null>(null);

  let deviceInfo = $state('');
  onMount(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches ? 'installed app' : 'browser';
    deviceInfo = `${navigator.userAgent} · ${screen.width}×${screen.height} · ${standalone}`;
  });

  async function submit() {
    if (!title.trim() || sending) return;
    sending = true;
    sendError = null;
    try {
      const item = await apiJson<FeedbackItem>('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          title: title.trim(),
          body: body.trim(),
          context: includeDevice ? deviceInfo : null
        })
      });
      title = '';
      body = '';
      sentNotice = item.issueNumber
        ? `Thanks! Filed as issue #${item.issueNumber}.`
        : 'Thanks! Saved — it will be filed as soon as the server can reach GitHub.';
      items = null;
      setTab('mine');
    } catch (e) {
      sendError = e instanceof Error ? e.message : 'Could not send feedback';
    } finally {
      sending = false;
    }
  }

  // --- My feedback --------------------------------------------------------
  let items = $state<FeedbackItem[] | null>(null);
  let github = $state(true);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let expanded = $state<string | null>(null);
  let comments = $state<Record<string, FeedbackComment[] | 'loading'>>({});

  async function load() {
    loading = true;
    loadError = null;
    try {
      const res = await apiJson<{ github: boolean; items: FeedbackItem[] }>('/api/feedback');
      items = res.items;
      github = res.github;
      comments = {};
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Could not load feedback';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (tab === 'mine' && items === null && !loading && !loadError) void load();
  });

  async function toggle(item: FeedbackItem) {
    expanded = expanded === item.id ? null : item.id;
    if (expanded && item.commentCount > 0 && !comments[item.id]) {
      comments[item.id] = 'loading';
      try {
        comments[item.id] = await apiJson<FeedbackComment[]>(`/api/feedback/${item.id}/comments`);
      } catch {
        comments[item.id] = [];
      }
    }
  }

  function statusOf(item: FeedbackItem): { label: string; cls: string } {
    switch (item.status) {
      case 'open':
        return { label: 'Open', cls: 'bg-accent-soft text-accent' };
      case 'closed':
        return item.closedReason === 'not_planned'
          ? { label: 'Closed', cls: 'bg-surface-3 text-fg-2' }
          : { label: 'Resolved', cls: 'bg-success/15 text-success' };
      case 'pending':
        return { label: github ? 'Not sent yet' : 'Saved', cls: 'bg-warning-soft text-warning' };
      default:
        return { label: 'Filed', cls: 'bg-surface-3 text-fg-2' };
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<header class="pt-safe pb-3 pt-4">
  <h1 class="text-h1 text-fg">Feedback</h1>
</header>

<div role="tablist" aria-label="Feedback" class="mb-4 flex gap-1 rounded-full bg-surface-2 p-1">
  {#each [{ id: 'submit', label: 'Send feedback' }, { id: 'mine', label: 'My feedback' }] as t}
    <button
      role="tab"
      aria-selected={tab === t.id}
      class="flex-1 rounded-full py-2 text-caption font-semibold {tab === t.id
        ? 'bg-accent text-accent-on'
        : 'text-fg-2'}"
      onclick={() => setTab(t.id as Tab)}>{t.label}</button
    >
  {/each}
</div>

{#if tab === 'submit'}
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
    <div class="grid grid-cols-3 gap-2">
      {#each kinds as k}
        <button
          type="button"
          class="flex flex-col items-center gap-1 rounded-md py-3 text-caption font-semibold {kind === k.id
            ? 'bg-accent-soft text-accent ring-1 ring-accent'
            : 'bg-surface text-fg-2'}"
          aria-pressed={kind === k.id}
          onclick={() => (kind = k.id)}
        >
          <k.icon size={20} />
          {k.label}
        </button>
      {/each}
    </div>

    <label class="block">
      <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Summary</span>
      <input
        bind:value={title}
        maxlength="120"
        required
        placeholder={kind === 'bug' ? 'What went wrong?' : kind === 'idea' ? 'What would you like?' : 'In a few words'}
        class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Details</span>
      <textarea
        bind:value={body}
        maxlength="5000"
        rows="6"
        placeholder={kind === 'bug'
          ? 'Steps to reproduce, what you expected, what happened instead…'
          : 'Anything that helps explain it…'}
        class="w-full resize-y rounded-md bg-surface-2 px-3 py-2 text-body text-fg placeholder:text-fg-muted focus:outline-none"
      ></textarea>
    </label>

    <label class="flex items-start gap-3 rounded-md bg-surface p-3">
      <input type="checkbox" bind:checked={includeDevice} class="mt-1 h-4 w-4 accent-[var(--accent)]" />
      <span class="min-w-0">
        <span class="block text-body text-fg">Include device info</span>
        <span class="block break-words text-caption text-fg-muted">{deviceInfo || 'Browser and screen size'}</span>
      </span>
    </label>

    <p class="text-caption text-fg-muted">
      Feedback is posted as a GitHub issue. Your username is not included.
    </p>

    {#if sendError}
      <p class="text-caption text-danger">{sendError}</p>
    {/if}

    <button
      type="submit"
      class="h-12 w-full rounded-md bg-accent text-body font-semibold text-accent-on disabled:opacity-40"
      disabled={!title.trim() || sending}
    >
      {sending ? 'Sending…' : 'Send feedback'}
    </button>
  </form>
{:else}
  {#if sentNotice}
    <div class="mb-4 flex items-center gap-2 rounded-lg bg-accent-soft p-3 text-caption text-fg">
      <Check size={16} class="shrink-0 text-accent" />
      {sentNotice}
    </div>
  {/if}

  <div class="mb-2 flex items-center justify-between">
    <h2 class="text-micro uppercase tracking-wide text-fg-muted">Submitted</h2>
    <button
      class="inline-flex items-center gap-1 text-caption text-fg-2 disabled:opacity-50"
      disabled={loading}
      onclick={load}
    >
      <RefreshCw size={14} class={loading ? 'animate-spin' : ''} /> Refresh
    </button>
  </div>

  {#if loadError}
    <p class="py-6 text-center text-caption text-danger">{loadError}</p>
  {:else if items === null}
    <p class="py-8 text-center text-caption text-fg-muted">Loading…</p>
  {:else}
    {#if !github}
      <p class="mb-3 rounded-md bg-warning-soft p-3 text-caption text-fg-2">
        GitHub isn't connected on this server, so feedback is saved here but replies won't show up.
      </p>
    {/if}
    <div class="space-y-2">
      {#each items as item (item.id)}
        {@const s = statusOf(item)}
        {@const K = kinds.find((k) => k.id === item.kind) ?? kinds[2]}
        <div class="rounded-lg bg-surface shadow-e1">
          <button class="flex w-full items-start gap-3 p-4 text-left" onclick={() => toggle(item)}>
            <K.icon size={18} class="mt-0.5 shrink-0 text-fg-muted" />
            <span class="min-w-0 flex-1">
              <span class="block text-body text-fg">{item.title}</span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-fg-muted">
                {fmtDate(item.createdAt)}
                {#if item.issueNumber}<span>#{item.issueNumber}</span>{/if}
                {#if item.commentCount > 0}
                  <span class="inline-flex items-center gap-0.5 text-accent">
                    <MessageCircle size={12} />
                    {item.commentCount}
                    {item.commentCount === 1 ? 'reply' : 'replies'}
                  </span>
                {/if}
              </span>
            </span>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-micro uppercase {s.cls}">{s.label}</span>
          </button>

          {#if expanded === item.id}
            <div class="space-y-3 border-t border-border px-4 pb-4 pt-3">
              {#if item.body}
                <p class="whitespace-pre-wrap break-words text-caption text-fg-2">{item.body}</p>
              {/if}

              {#if item.labels.length}
                <div class="flex flex-wrap gap-1">
                  {#each item.labels as l}
                    <span class="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-fg-2">{l}</span>
                  {/each}
                </div>
              {/if}

              {#if comments[item.id] === 'loading'}
                <p class="text-caption text-fg-muted">Loading replies…</p>
              {:else if comments[item.id]?.length}
                <div class="space-y-2">
                  {#each comments[item.id] as FeedbackComment[] as c (c.id)}
                    <div class="rounded-md bg-surface-2 p-3">
                      <p class="mb-1 text-micro uppercase text-fg-muted">{c.author} · {fmtDate(c.createdAt)}</p>
                      <p class="whitespace-pre-wrap break-words text-caption text-fg">{c.body}</p>
                    </div>
                  {/each}
                </div>
              {:else if item.issueNumber}
                <p class="text-caption text-fg-muted">No replies yet.</p>
              {/if}

              {#if item.issueUrl}
                <a
                  href={item.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-caption font-semibold text-accent"
                >
                  View on GitHub <ExternalLink size={14} />
                </a>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="py-8 text-center text-caption text-fg-muted">
          Nothing yet. Anything you send shows up here, with its status and any replies.
        </p>
      {/each}
    </div>
  {/if}
{/if}
