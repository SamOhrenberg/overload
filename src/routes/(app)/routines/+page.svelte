<script lang="ts">
  import { ChevronLeft, Plus, Trash2, Check, ChevronDown } from 'lucide-svelte';
  import { api, apiJson } from '$lib/client/api';
  import { send } from '$lib/client/outbox';
  import { GROUP_COLORS, groupColorVar, WEEKDAYS_LONG } from '$lib/format';

  let { data } = $props();

  type Group = { id: string; name: string; color: string | null };
  let groups = $state<Group[]>(data.groups.map((g) => ({ id: g.id, name: g.name, color: g.color })));
  let members = $state<Record<string, string[]>>(
    Object.fromEntries(Object.entries(data.members).map(([k, v]) => [k, [...v]]))
  );
  let schedule = $state<Record<number, string[]>>(
    Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, [...(data.schedule[d] ?? [])]]))
  );

  let newName = $state('');
  let openGroup = $state<string | null>(null);
  let openDay = $state<number | null>(null);

  // Everything on this screen saves automatically on each change; this makes
  // that visible (and surfaces an offline/queued write instead of it looking
  // like nothing happened).
  let saveState = $state<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  // `send()` resolves true when delivered, false when queued; `api()` resolves a
  // Response. Reflect the real outcome rather than the unreliable onLine flag.
  async function tracked(p: Promise<boolean | Response>) {
    clearTimeout(saveTimer);
    saveState = 'saving';
    let ok = false;
    try {
      const r = await p;
      ok = typeof r === 'boolean' ? r : r.ok;
    } catch {
      ok = false;
    }
    saveState = ok ? 'saved' : 'offline';
    saveTimer = setTimeout(() => (saveState = 'idle'), 2500);
  }

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';
  const groupColor = (id: string) => groups.find((g) => g.id === id)?.color ?? null;

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    newName = '';
    saveState = 'saving';
    try {
      const row = await apiJson<Group>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      groups = [...groups, { id: row.id, name: row.name, color: row.color }];
      members[row.id] = [];
      openGroup = row.id;
      saveState = 'saved';
    } catch {
      // Creating a group needs connectivity to allocate an id.
      saveState = 'offline';
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => (saveState = 'idle'), 2500);
  }

  function rename(id: string, name: string) {
    groups = groups.map((g) => (g.id === id ? { ...g, name } : g));
    void tracked(send(`/api/groups/${id}`, { name }, 'PATCH'));
  }

  function setColor(id: string, color: string) {
    groups = groups.map((g) => (g.id === id ? { ...g, color } : g));
    void tracked(send(`/api/groups/${id}`, { color }, 'PATCH'));
  }

  async function removeGroup(id: string) {
    groups = groups.filter((g) => g.id !== id);
    delete members[id];
    for (let d = 0; d < 7; d++) schedule[d] = schedule[d].filter((g) => g !== id);
    if (openGroup === id) openGroup = null;
    void tracked(api(`/api/groups/${id}`, { method: 'DELETE' }));
  }

  function toggleMember(groupId: string, exId: string) {
    const list = members[groupId] ?? [];
    const member = !list.includes(exId);
    members[groupId] = member ? [...list, exId] : list.filter((x) => x !== exId);
    void tracked(send(`/api/groups/${groupId}/members`, { exerciseId: exId, member }, 'PUT'));
  }

  function toggleDay(dow: number, groupId: string) {
    const list = schedule[dow] ?? [];
    schedule[dow] = list.includes(groupId)
      ? list.filter((g) => g !== groupId)
      : [...list, groupId];
    void tracked(send('/api/schedule', { dayOfWeek: dow, groupIds: schedule[dow] }, 'PUT'));
  }
</script>

<header class="pt-safe pb-2 pt-4">
  <a href="/me" class="inline-flex items-center gap-1 text-caption text-fg-2">
    <ChevronLeft size={16} /> Me
  </a>
  <div class="mt-1 flex items-center justify-between">
    <h1 class="text-h1 text-fg">Routines</h1>
    <span
      class="text-caption font-semibold transition-opacity duration-fast {saveState === 'idle'
        ? 'opacity-0'
        : 'opacity-100'} {saveState === 'offline' ? 'text-warning' : 'text-success'}"
      aria-live="polite"
    >
      {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}Saved ✓{:else if saveState === 'offline'}Saved offline — will sync{/if}
    </span>
  </div>
  <p class="text-caption text-fg-muted">Changes save automatically.</p>
</header>

<!-- Groups ------------------------------------------------------------ -->
<h2 class="mb-2 mt-2 text-micro uppercase tracking-wide text-fg-muted">Groups</h2>

<div class="mb-3 flex items-center gap-2">
  <input
    bind:value={newName}
    placeholder="New group (e.g. Push)"
    class="h-11 flex-1 rounded-md bg-surface-2 px-3 text-body text-fg placeholder:text-fg-muted focus:outline-none"
    onkeydown={(e) => e.key === 'Enter' && createGroup()}
  />
  <button
    class="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-on disabled:opacity-40"
    aria-label="Add group"
    disabled={!newName.trim()}
    onclick={createGroup}><Plus size={20} /></button
  >
</div>

<div class="mb-6 space-y-2">
  {#each groups as g (g.id)}
    {@const open = openGroup === g.id}
    <div class="overflow-hidden rounded-lg bg-surface">
      <button
        class="flex w-full items-center justify-between p-4 text-left"
        onclick={() => (openGroup = open ? null : g.id)}
      >
        <span class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-full" style="background: {groupColorVar(g.color)}"></span>
          <span class="text-body-strong text-fg">{g.name}</span>
          <span class="text-caption text-fg-muted">{members[g.id]?.length ?? 0}</span>
        </span>
        <ChevronDown size={18} class="text-fg-muted transition-transform {open ? 'rotate-180' : ''}" />
      </button>

      {#if open}
        <div class="border-t border-border p-4">
          <label class="mb-1 block text-micro uppercase tracking-wide text-fg-muted" for="name-{g.id}">
            Name
          </label>
          <input
            id="name-{g.id}"
            value={g.name}
            class="mb-3 h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg focus:outline-none"
            onchange={(e) => rename(g.id, (e.target as HTMLInputElement).value)}
          />

          <p class="mb-1 text-micro uppercase tracking-wide text-fg-muted">Color</p>
          <div class="mb-4 flex gap-2">
            {#each GROUP_COLORS as c}
              <button
                aria-label={c.key}
                class="h-8 w-8 rounded-full {g.color === c.key ? 'ring-2 ring-offset-2 ring-offset-surface' : ''}"
                style="background: {c.var}; --tw-ring-color: {c.var}"
                onclick={() => setColor(g.id, c.key)}
              ></button>
            {/each}
          </div>

          <p class="mb-1 text-micro uppercase tracking-wide text-fg-muted">Exercises</p>
          <div class="mb-4 max-h-64 space-y-0.5 overflow-y-auto">
            {#each data.exercises as ex (ex.id)}
              {@const on = members[g.id]?.includes(ex.id)}
              <button
                class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left {on ? 'bg-surface-2' : ''}"
                onclick={() => toggleMember(g.id, ex.id)}
              >
                <span class="text-body text-fg">{ex.name}</span>
                <span
                  class="flex h-6 w-6 items-center justify-center rounded-full {on
                    ? 'bg-accent text-accent-on'
                    : 'border border-border-strong text-transparent'}"
                >
                  <Check size={14} />
                </span>
              </button>
            {/each}
          </div>

          <button
            class="flex items-center gap-1 text-caption font-semibold text-danger"
            onclick={() => removeGroup(g.id)}
          >
            <Trash2 size={15} /> Delete group
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <p class="py-6 text-center text-caption text-fg-muted">
      No groups yet. Create one above to start building routines.
    </p>
  {/each}
</div>

<!-- Weekly schedule --------------------------------------------------- -->
<h2 class="mb-2 text-micro uppercase tracking-wide text-fg-muted">Weekly schedule</h2>
<div class="mb-10 space-y-2">
  {#each WEEKDAYS_LONG as label, dow}
    {@const open = openDay === dow}
    {@const assigned = schedule[dow] ?? []}
    <div class="overflow-hidden rounded-lg bg-surface">
      <button
        class="flex w-full items-center justify-between p-4 text-left"
        onclick={() => (openDay = open ? null : dow)}
      >
        <span class="text-body-strong text-fg">{label}</span>
        <span class="flex items-center gap-2">
          {#if assigned.length}
            <span class="flex flex-wrap justify-end gap-1">
              {#each assigned as gid (gid)}
                <span
                  class="rounded-full px-2 py-0.5 text-micro font-semibold"
                  style="background: {groupColorVar(groupColor(gid))}22; color: {groupColorVar(groupColor(gid))}"
                >
                  {groupName(gid)}
                </span>
              {/each}
            </span>
          {:else}
            <span class="text-caption text-fg-muted">Rest</span>
          {/if}
          <ChevronDown size={18} class="text-fg-muted transition-transform {open ? 'rotate-180' : ''}" />
        </span>
      </button>

      {#if open}
        <div class="border-t border-border p-4">
          {#if groups.length}
            <div class="space-y-0.5">
              {#each groups as g (g.id)}
                {@const on = assigned.includes(g.id)}
                <button
                  class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left {on ? 'bg-surface-2' : ''}"
                  onclick={() => toggleDay(dow, g.id)}
                >
                  <span class="flex items-center gap-2">
                    <span class="h-2.5 w-2.5 rounded-full" style="background: {groupColorVar(g.color)}"></span>
                    <span class="text-body text-fg">{g.name}</span>
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
            </div>
          {:else}
            <p class="text-caption text-fg-muted">Create a group first.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
