<script lang="ts">
  import { base, resolve } from '$app/paths';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import {
    House,
    Target,
    ChartColumn,
    Plus,
    User,
    Dumbbell,
    CalendarCog,
    MessageSquare,
    Play
  } from 'lucide-svelte';

  const tabs = [
    { href: '/' as const, label: 'Today', icon: House, match: (p: string) => p === '/' },
    { href: '/targets' as const, label: 'Targets', icon: Target, match: (p: string) => p.startsWith('/targets') }
  ];
  const tabsRight = [
    { href: '/history' as const, label: 'History', icon: ChartColumn, match: (p: string) => p.startsWith('/history') },
    { href: '/me' as const, label: 'Me', icon: User, match: (p: string) => p.startsWith('/me') }
  ];

  // Long-press menu on the center button: quick jumps to common pages.
  const quick = [
    { href: '/workout/active' as const, label: 'Start workout', icon: Play },
    { href: '/routines' as const, label: 'Routines', icon: CalendarCog },
    { href: '/exercises' as const, label: 'Exercises', icon: Dumbbell },
    { href: '/feedback' as const, label: 'Feedback', icon: MessageSquare }
  ];

  // Compare against the route path, without any GitHub Pages base prefix.
  let path = $derived($page.url.pathname.slice(base.length) || '/');

  // --- Tap = start workout, press-and-hold = open the quick menu ---
  const HOLD_MS = 450;
  const MOVE_TOLERANCE = 10;
  let menuOpen = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  let startX = 0;
  let startY = 0;

  function pressStart(e: PointerEvent) {
    if (e.button !== 0) return;
    held = false;
    startX = e.clientX;
    startY = e.clientY;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      menuOpen = true;
      navigator.vibrate?.(12);
    }, HOLD_MS);
  }
  function pressMove(e: PointerEvent) {
    if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
      clearTimeout(holdTimer);
    }
  }
  function pressEnd() {
    clearTimeout(holdTimer);
  }
  function onFabClick(e: MouseEvent) {
    // The click that follows a long-press must not also navigate.
    if (held) {
      e.preventDefault();
      held = false;
    } else if (menuOpen) {
      // Tapping the (now ×) button again just dismisses the menu.
      e.preventDefault();
      menuOpen = false;
    }
  }

  function closeMenu() {
    menuOpen = false;
  }
  async function pick(href: (typeof quick)[number]['href']) {
    menuOpen = false;
    await goto(resolve(href));
  }

  // Close the menu if the route changes underneath it.
  $effect(() => {
    void path;
    menuOpen = false;
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeMenu()} />

{#if menuOpen}
  <button
    class="fixed inset-0 z-40 cursor-default bg-black/40"
    aria-label="Close menu"
    transition:fade={{ duration: 120 }}
    onclick={closeMenu}
  ></button>
  <div
    class="fixed inset-x-0 z-50 flex justify-center px-4"
    style="bottom: calc(env(safe-area-inset-bottom) + 92px)"
  >
    <div
      role="menu"
      aria-label="Quick menu"
      class="w-full max-w-[16rem] overflow-hidden rounded-lg border border-border bg-surface shadow-e4"
      transition:fly={{ y: 16, duration: 160 }}
    >
      {#each quick as item, i}
        <button
          role="menuitem"
          class="flex w-full items-center gap-3 px-4 py-3 text-left text-body text-fg active:bg-surface-2 {i > 0
            ? 'border-t border-border'
            : ''} {i === 0 ? 'font-semibold text-accent' : ''}"
          onclick={() => pick(item.href)}
        >
          <item.icon size={20} />
          {item.label}
        </button>
      {/each}
    </div>
  </div>
{/if}

<nav class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-e2 pb-safe">
  <div class="mx-auto flex max-w-xl items-stretch justify-between px-2">
    {#each tabs as tab}
      {@const Active = tab.match(path)}
      <a
        href={resolve(tab.href)}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 {Active ? 'text-accent' : 'text-fg-muted'}"
        aria-current={Active ? 'page' : undefined}
      >
        <tab.icon size={24} />
        <span class="text-micro uppercase">{tab.label}</span>
      </a>
    {/each}

    <!-- Center raised FAB: tap starts a workout, press-and-hold opens the quick menu -->
    <div class="relative z-50 flex w-16 items-start justify-center">
      <a
        href={resolve('/workout/active')}
        aria-label="Start workout (press and hold for more)"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        draggable="false"
        class="fab -mt-6 flex items-center justify-center rounded-full bg-accent text-accent-on shadow-e2 transition-transform duration-fast active:scale-95"
        style="height:60px;width:60px"
        onpointerdown={pressStart}
        onpointermove={pressMove}
        onpointerup={pressEnd}
        onpointercancel={pressEnd}
        onpointerleave={pressEnd}
        onclick={onFabClick}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <span class="transition-transform duration-med {menuOpen ? 'rotate-45' : ''}">
          <Plus size={30} strokeWidth={2.5} />
        </span>
      </a>
    </div>

    {#each tabsRight as tab}
      {@const Active = tab.match(path)}
      <a
        href={resolve(tab.href)}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 {Active ? 'text-accent' : 'text-fg-muted'}"
        aria-current={Active ? 'page' : undefined}
      >
        <tab.icon size={24} />
        <span class="text-micro uppercase">{tab.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  /* Stop iOS/Android from showing the link preview / text selection on hold. */
  .fab {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
</style>
