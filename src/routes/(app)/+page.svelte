<script lang="ts">
  import { resolve } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { Zap, Dumbbell, X, Plus, Check, CalendarCog } from 'lucide-svelte';
  import ExerciseCard from '$lib/components/ExerciseCard.svelte';
  import AdjustSheet from '$lib/components/AdjustSheet.svelte';
  import { groupColorVar } from '$lib/format';
  import { send } from '$lib/client/outbox';
  import type { TodayCard } from '$lib/types';

  let { data } = $props();

  // Local copy so Accept can optimistically mark a card done; re-synced whenever
  // the loader re-runs (e.g. after a swap triggers invalidateAll).
  let cards = $state<TodayCard[]>(data.cards);
  $effect(() => {
    cards = data.cards;
  });

  let pickerOpen = $state(false);
  let adjustCard = $state<TodayCard | null>(null);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  const activeIds = $derived(new Set(data.activeGroups.map((g) => g.id)));

  async function setDayGroups(ids: string[]) {
    // Writes day_plan for today only — never the weekly schedule. Empty reverts
    // to the weekly default. Offline-safe via the outbox; refresh needs the
    // write to land, so we invalidate after it resolves.
    await send('/api/day-plan', { date: data.today.date, groupIds: ids }, 'PUT');
    await invalidateAll();
  }

  function removeGroup(id: string) {
    return setDayGroups([...activeIds].filter((g) => g !== id));
  }

  function toggleGroup(id: string) {
    const next = new Set(activeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return setDayGroups([...next]);
  }

  function resetToWeekly() {
    return setDayGroups([]);
  }

  async function accept(card: TodayCard) {
    if (!card.recId) return;
    cards = cards.map((c) =>
      c.exerciseId === card.exerciseId ? { ...c, status: 'done' } : c
    );
    await send('/api/recommendations', { id: card.recId, status: 'accepted' }, 'PATCH');
  }

  async function saveAdjust(target: Record<string, unknown>) {
    const card = adjustCard;
    adjustCard = null;
    if (!card?.recId) return;
    await send('/api/recommendations', { id: card.recId, target }, 'PATCH');
    await invalidateAll();
  }
</script>

<header class="pt-safe flex items-start justify-between pb-3 pt-4">
  <div>
    <h1 class="text-h1 text-fg">{greeting()}, {data.user.username}</h1>
    <p class="text-caption text-fg-2">
      {new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      })}
    </p>
  </div>
  <a
    href={resolve('/exercises')}
    aria-label="Exercise library"
    class="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-fg-2 shadow-e1"
  >
    <Dumbbell size={20} />
  </a>
</header>

{#if data.hasGroups}
  <!-- Active group(s) for today + same-day swap -->
  <div class="mb-4">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-micro uppercase tracking-wide text-fg-muted">
        {data.activeGroups.length ? "Today's plan" : 'Today'}{#if data.swapped}<span
            class="ml-1 text-accent">· swapped</span
          >{/if}
      </h2>
      {#if data.swapped}
        <button class="text-caption text-fg-2 underline" onclick={resetToWeekly}>
          Reset to weekly
        </button>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#each data.activeGroups as g (g.id)}
        <span
          class="inline-flex items-center gap-1.5 rounded-full border bg-surface py-1 pl-2.5 pr-1.5 text-caption font-semibold text-fg"
          style="border-color: {groupColorVar(g.color)}"
        >
          <span class="h-2 w-2 rounded-full" style="background: {groupColorVar(g.color)}"></span>
          {g.name}
          <button
            aria-label="Remove {g.name} from today"
            class="flex h-5 w-5 items-center justify-center rounded-full text-fg-muted active:bg-surface-2"
            onclick={() => removeGroup(g.id)}
          >
            <X size={13} />
          </button>
        </span>
      {/each}
      <button
        class="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-1 text-caption font-semibold text-fg-2"
        onclick={() => (pickerOpen = true)}
      >
        <Plus size={14} /> {data.activeGroups.length ? 'Swap / add' : 'Pick groups'}
      </button>
    </div>
    {#if data.mode === 'backlog'}
      <a href={resolve('/routines')} class="mt-2 block text-caption text-fg-2">
        No weekly plan yet — pick today's groups above, or
        <span class="text-accent underline">plan your week</span>.
      </a>
    {/if}
  </div>
{:else}
  <!-- First-run: no groups at all -->
  <a
    href={resolve('/routines')}
    class="mb-4 flex items-center justify-between rounded-lg border border-dashed border-border-strong bg-surface p-4"
  >
    <span class="flex items-center gap-2">
      <CalendarCog size={20} class="text-accent" />
      <span>
        <span class="block text-body-strong text-fg">Set up your routines</span>
        <span class="block text-caption text-fg-2">Group exercises and plan your week.</span>
      </span>
    </span>
    <Plus size={18} class="text-fg-muted" />
  </a>
{/if}

{#if cards.length > 0}
  {#if data.mode === 'backlog'}
    <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">All targets</h2>
  {/if}
  <div class="space-y-3">
    {#each cards as c (c.exerciseId)}
      <ExerciseCard
        name={c.name}
        goal={c.goal}
        target={c.target}
        lastSummary={c.lastSummary}
        rationale={c.rationale}
        status={c.status}
        onaccept={c.recId ? () => accept(c) : undefined}
        onadjust={c.recId ? () => (adjustCard = c) : undefined}
      />
    {/each}
  </div>
{:else}
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <Zap size={48} class="text-on-surface-faint" />
    <p class="text-h2 text-fg">
      {data.mode === 'rest' ? 'Rest day' : 'Nothing planned yet'}
    </p>
    <p class="text-caption text-fg-2">
      {#if data.mode === 'rest'}
        Nothing scheduled today — tap “{data.activeGroups.length
          ? 'Swap / add'
          : 'Pick groups'}” to train something anyway.
      {:else}
        Log a workout and Overload will have your next targets waiting here.
      {/if}
    </p>
  </div>
{/if}

<!-- Group picker: swap/add today's groups (bottom sheet) -->
{#if pickerOpen}
  <div
    class="fixed inset-0 z-50 flex flex-col justify-end"
    style="background: var(--scrim)"
    role="button"
    tabindex="0"
    onclick={() => (pickerOpen = false)}
    onkeydown={(e) => e.key === 'Escape' && (pickerOpen = false)}
  >
    <div
      class="max-h-[70vh] overflow-y-auto rounded-t-xl bg-surface p-4 pb-safe"
      role="dialog"
      aria-label="Pick today's groups"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <div class="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong"></div>
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-h2 text-fg">Today's groups</h3>
        <button class="text-caption font-semibold text-accent" onclick={() => (pickerOpen = false)}>
          Done
        </button>
      </div>
      <p class="mb-3 text-caption text-fg-2">Changes apply to today only.</p>
      {#if data.allGroups.length}
        {#each data.allGroups as g (g.id)}
          {@const on = activeIds.has(g.id)}
          <button
            class="flex w-full items-center justify-between border-b border-border py-3 text-left"
            onclick={() => toggleGroup(g.id)}
          >
            <span class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full" style="background: {groupColorVar(g.color)}"></span>
              <span class="text-body text-fg">{g.name}</span>
              <span class="text-caption text-fg-muted">{g.memberCount}</span>
            </span>
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full {on
                ? 'bg-accent text-accent-on'
                : 'border border-border-strong text-transparent'}"
            >
              <Check size={14} />
            </span>
          </button>
        {/each}
      {:else}
        <a href={resolve('/routines')} class="block py-6 text-center text-caption text-accent">
          Create your first group →
        </a>
      {/if}
    </div>
  </div>
{/if}

{#if adjustCard}
  <AdjustSheet
    name={adjustCard.name}
    unit={adjustCard.unit}
    rawTarget={adjustCard.rawTarget}
    onclose={() => (adjustCard = null)}
    onsave={saveAdjust}
  />
{/if}
