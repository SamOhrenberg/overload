<script lang="ts">
  import { page } from '$app/stores';
  import { House, ChartColumn, Plus, Dumbbell, User } from 'lucide-svelte';

  const tabs = [
    { href: '/', label: 'Today', icon: House, match: (p: string) => p === '/' },
    { href: '/history', label: 'History', icon: ChartColumn, match: (p: string) => p.startsWith('/history') }
  ];
  const tabsRight = [
    { href: '/exercises', label: 'Exercises', icon: Dumbbell, match: (p: string) => p.startsWith('/exercises') },
    { href: '/me', label: 'Me', icon: User, match: (p: string) => p.startsWith('/me') }
  ];

  let path = $derived($page.url.pathname);
</script>

<nav class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-e2 pb-safe">
  <div class="mx-auto flex max-w-xl items-stretch justify-between px-2">
    {#each tabs as tab}
      {@const Active = tab.match(path)}
      <a
        href={tab.href}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 {Active ? 'text-accent' : 'text-fg-muted'}"
        aria-current={Active ? 'page' : undefined}
      >
        <tab.icon size={24} />
        <span class="text-micro uppercase">{tab.label}</span>
      </a>
    {/each}

    <!-- Center raised Start FAB -->
    <div class="flex w-16 items-start justify-center">
      <a
        href="/workout/active"
        aria-label="Start workout"
        class="-mt-6 flex h-15 w-15 items-center justify-center rounded-full bg-accent text-accent-on shadow-e2 active:scale-95 transition-transform duration-fast"
        style="height:60px;width:60px"
      >
        <Plus size={30} strokeWidth={2.5} />
      </a>
    </div>

    {#each tabsRight as tab}
      {@const Active = tab.match(path)}
      <a
        href={tab.href}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 {Active ? 'text-accent' : 'text-fg-muted'}"
        aria-current={Active ? 'page' : undefined}
      >
        <tab.icon size={24} />
        <span class="text-micro uppercase">{tab.label}</span>
      </a>
    {/each}
  </div>
</nav>
