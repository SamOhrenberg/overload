<script lang="ts">
  import { Search, ChevronRight } from 'lucide-svelte';
  import GoalChip from '$lib/components/GoalChip.svelte';

  let { data } = $props();
  let query = $state('');
  let modality = $state<'all' | string>('all');

  const modalities = ['all', 'barbell', 'dumbbell', 'machine', 'bodyweight', 'cardio'];

  let filtered = $derived(
    data.exercises.filter(
      (e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) &&
        (modality === 'all' || e.modality === modality)
    )
  );
</script>

<header class="pt-safe pb-2 pt-4">
  <h1 class="text-h1 text-fg">Exercises</h1>
</header>

<div class="mb-3 flex items-center gap-2 rounded-md bg-surface-2 px-3">
  <Search size={18} class="text-fg-muted" />
  <input
    bind:value={query}
    placeholder="Search"
    class="h-11 flex-1 bg-transparent text-body text-fg placeholder:text-fg-muted focus:outline-none"
  />
</div>

<div class="mb-4 flex gap-2 overflow-x-auto pb-1">
  {#each modalities as m}
    <button
      class="shrink-0 rounded-full px-3 py-1 text-caption font-semibold capitalize {modality === m
        ? 'bg-accent text-accent-on'
        : 'bg-surface-3 text-fg-2'}"
      onclick={() => (modality = m)}>{m}</button
    >
  {/each}
</div>

<div class="space-y-1">
  {#each filtered as ex (ex.id)}
    <a
      href={`/exercises/${ex.id}`}
      class="flex items-center justify-between rounded-md bg-surface px-4 py-3"
    >
      <span class="text-body text-fg">{ex.name}</span>
      <span class="flex items-center gap-2">
        {#if ex.defaultGoal}<GoalChip goal={ex.defaultGoal} />{/if}
        <ChevronRight size={18} class="text-fg-muted" />
      </span>
    </a>
  {:else}
    <p class="py-8 text-center text-caption text-fg-muted">No match.</p>
  {/each}
</div>
