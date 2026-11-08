<script lang="ts">
  import { goto } from '$app/navigation';
  import { Zap } from 'lucide-svelte';
  import ExerciseCard from '$lib/components/ExerciseCard.svelte';
  import { targetLabel } from '$lib/format';
  import { api } from '$lib/client/api';

  let { data } = $props();
  let recs = $state(data.recommendations);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  async function accept(id: string) {
    recs = recs.filter((r) => r.id !== id);
    await api('/api/recommendations', {
      method: 'PATCH',
      body: JSON.stringify({ id, status: 'accepted' })
    });
  }
</script>

<header class="pt-safe pb-3 pt-4">
  <h1 class="text-h1 text-fg">{greeting()}, {data.user.username}</h1>
  <p class="text-caption text-fg-2">
    {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
  </p>
</header>

{#if recs.length > 0}
  <h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Today's plan</h2>
  <div class="space-y-3">
    {#each recs as r (r.id)}
      <ExerciseCard
        name={r.name}
        goal={r.goal}
        target={targetLabel(r.target, r.unit)}
        rationale={r.rationale}
        onaccept={() => accept(r.id)}
      />
    {/each}
  </div>
{:else}
  <div class="flex flex-col items-center gap-3 py-16 text-center">
    <Zap size={48} class="text-on-surface-faint" />
    <p class="text-h2 text-fg">Nothing planned yet</p>
    <p class="text-caption text-fg-2">
      Log a workout and Overload will have your next targets waiting here.
    </p>
  </div>
{/if}

<div class="fixed inset-x-0 bottom-20 px-safe">
  <div class="mx-auto max-w-xl">
    <button
      class="h-14 w-full rounded-md bg-accent text-body font-bold text-accent-on shadow-e2 active:scale-[.99]"
      onclick={() => goto('/workout/active')}
    >
      Start workout
    </button>
  </div>
</div>
