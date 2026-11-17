<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { ChevronLeft } from 'lucide-svelte';
  import { apiJson } from '$lib/client/api';
  import ExerciseFields from '$lib/components/ExerciseFields.svelte';
  import {
    LOADED_MODALITIES,
    parseLoadStep,
    parseMuscles,
    type ExerciseUnit,
    type Goal,
    type Modality
  } from '$lib/exercise';

  let name = $state($page.url.searchParams.get('name') ?? '');
  let modality = $state<Modality>('barbell');
  let unit = $state<ExerciseUnit>(($page.data.user?.defaultUnit as ExerciseUnit) === 'kg' ? 'kg' : 'lb');
  let loadIncrement = $state('');
  let defaultGoal = $state<Goal | null>(null);
  let muscles = $state('');
  let tracksSpeedZones = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  async function save() {
    if (!name.trim() || saving) return;
    saving = true;
    saveError = null;
    try {
      const row = await apiJson<{ id: string }>('/api/exercises', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          modality,
          unit,
          loadIncrement: LOADED_MODALITIES.includes(modality) ? parseLoadStep(loadIncrement) : null,
          defaultGoal,
          muscleGroups: parseMuscles(muscles),
          tracksSpeedZones: modality === 'cardio' && tracksSpeedZones
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
  <ExerciseFields
    bind:name
    bind:modality
    bind:unit
    bind:loadIncrement
    bind:defaultGoal
    bind:muscles
    bind:tracksSpeedZones
    autofocus
  />

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
