<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { ChevronLeft } from 'lucide-svelte';
  import { apiJson } from '$lib/client/api';

  type Modality = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio';
  type Unit = 'lb' | 'kg' | 'km' | 'mi' | 'min';
  type Goal = 'strength' | 'endurance' | 'stamina';

  const modalities: Modality[] = ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cardio'];
  const goals: (Goal | null)[] = [null, 'strength', 'endurance', 'stamina'];

  let name = $state($page.url.searchParams.get('name') ?? '');
  let modality = $state<Modality>('barbell');
  let unit = $state<Unit>(($page.data.user?.defaultUnit as Unit) === 'kg' ? 'kg' : 'lb');
  let loadIncrement = $state('');
  let defaultGoal = $state<Goal | null>(null);
  let muscles = $state('');
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  let isCardio = $derived(modality === 'cardio');
  let units = $derived<Unit[]>(isCardio ? ['min', 'km', 'mi'] : ['lb', 'kg']);

  // Keep the unit valid when switching between cardio and resistance.
  $effect(() => {
    if (!units.includes(unit)) unit = units[0];
  });

  async function save() {
    if (!name.trim() || saving) return;
    saving = true;
    saveError = null;
    try {
      const inc = parseFloat(loadIncrement);
      const row = await apiJson<{ id: string }>('/api/exercises', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          modality,
          unit,
          loadIncrement: !isCardio && Number.isFinite(inc) && inc > 0 ? inc : null,
          defaultGoal,
          muscleGroups: muscles
            .split(',')
            .map((m) => m.trim().toLowerCase())
            .filter(Boolean)
        })
      });
      await goto(resolve(`/exercises/${row.id}`), { replaceState: true });
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Could not create exercise';
      saving = false;
    }
  }
</script>

<header class="pt-safe flex items-center gap-1 pb-3 pt-4">
  <a href={resolve('/exercises')} class="-ml-2 p-1 text-fg-muted" aria-label="Back to exercises">
    <ChevronLeft size={24} />
  </a>
  <h1 class="text-h1 text-fg">New exercise</h1>
</header>

<form
  class="space-y-4"
  onsubmit={(e) => {
    e.preventDefault();
    save();
  }}
>
  <label class="block">
    <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Name</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={name}
      maxlength="80"
      required
      autofocus
      placeholder="e.g. Incline Dumbbell Press"
      class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
    />
  </label>

  <div>
    <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Type</span>
    <div class="flex flex-wrap gap-2">
      {#each modalities as m}
        <button
          type="button"
          aria-pressed={modality === m}
          class="rounded-full px-3 py-1.5 text-caption font-semibold capitalize {modality === m
            ? 'bg-accent text-accent-on'
            : 'bg-surface-3 text-fg-2'}"
          onclick={() => (modality = m)}>{m}</button
        >
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Unit</span>
      <div class="flex gap-1 rounded-md bg-surface-2 p-1">
        {#each units as u}
          <button
            type="button"
            aria-pressed={unit === u}
            class="h-9 flex-1 rounded text-caption font-semibold {unit === u ? 'bg-surface text-fg' : 'text-fg-muted'}"
            onclick={() => (unit = u)}>{u}</button
          >
        {/each}
      </div>
    </div>
    {#if !isCardio}
      <label class="block">
        <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Load step</span>
        <input
          bind:value={loadIncrement}
          inputmode="decimal"
          placeholder={unit === 'kg' ? '2.5' : '5'}
          class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
        />
      </label>
    {/if}
  </div>

  <div>
    <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Default goal</span>
    <div class="flex flex-wrap gap-2">
      {#each goals as g}
        <button
          type="button"
          aria-pressed={defaultGoal === g}
          class="rounded-full px-3 py-1.5 text-caption font-semibold capitalize {defaultGoal === g
            ? 'bg-accent text-accent-on'
            : 'bg-surface-3 text-fg-2'}"
          onclick={() => (defaultGoal = g)}>{g ?? 'None'}</button
        >
      {/each}
    </div>
  </div>

  <label class="block">
    <span class="mb-1 block text-micro uppercase tracking-wide text-fg-muted">Muscle groups</span>
    <input
      bind:value={muscles}
      placeholder="chest, triceps"
      class="h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
    />
    <span class="mt-1 block text-caption text-fg-muted">Optional, comma-separated.</span>
  </label>

  {#if saveError}
    <p class="text-caption text-danger">{saveError}</p>
  {/if}

  <button
    type="submit"
    class="h-12 w-full rounded-md bg-accent text-body font-semibold text-accent-on disabled:opacity-40"
    disabled={!name.trim() || saving}
  >
    {saving ? 'Creating…' : 'Create exercise'}
  </button>
</form>
