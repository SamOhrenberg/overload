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
    Play,
    CirclePlus,
    Ellipsis
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
    { href: '/exercises/new' as const, label: 'New exercise', icon: CirclePlus },
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
  // True while a press is in progress: drives the ring that fills up to HOLD_MS.
  let pressing = $state(false);

  // One-time "Hold for more" hint, until the user has opened the menu once.
  const LS_HINT = 'overload.fabHintSeen';
  let showHint = $state(false);
  $effect(() => {
    try {
      if (localStorage.getItem(LS_HINT)) return;
    } catch {
      return;
    }
    const show = setTimeout(() => (showHint = true), 800);
    const hide = setTimeout(() => (showHint = false), 8000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  });
  function hintSeen() {
    showHint = false;
    try {
      localStorage.setItem(LS_HINT, '1');
    } catch {
      /* blocked storage — the hint just shows again next launch */
    }
  }

  function pressStart(e: PointerEvent) {
    if (e.button !== 0) return;
    held = false;
    startX = e.clientX;
    startY = e.clientY;
    clearTimeout(holdTimer);
    pressing = !menuOpen;
    holdTimer = setTimeout(() => {
      held = true;
      pressing = false;
      menuOpen = true;
      hintSeen();
      navigator.vibrate?.(12);
    }, HOLD_MS);
  }
  function pressMove(e: PointerEvent) {
    if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
      pressEnd();
    }
  }
  function pressEnd() {
    clearTimeout(holdTimer);
    pressing = false;
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
      {#if showHint && !menuOpen}
        <div
          class="pointer-events-none absolute bottom-full mb-8 whitespace-nowrap rounded-md bg-surface-3 px-3 py-1.5 text-caption font-semibold text-fg shadow-e2"
          transition:fade={{ duration: 160 }}
        >
          Hold for more
          <span class="absolute left-1/2 top-full -ml-1.5 h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-surface-3"></span>
        </div>
      {/if}
      <a
        href={resolve('/workout/active')}
        aria-label="Start workout (press and hold for more)"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        draggable="false"
        class="fab relative -mt-6 flex items-center justify-center rounded-full bg-accent text-accent-on shadow-e2 transition-transform duration-fast active:scale-95"
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

        <!-- Hold progress: a ring that fills while the button is held -->
        <svg class="pointer-events-none absolute -inset-1.5 -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
          <circle
            class="hold-ring {pressing ? 'filling' : ''}"
            cx="36"
            cy="36"
            r="34"
            fill="none"
            stroke="var(--text)"
            stroke-width="3"
            stroke-linecap="round"
            style="--hold-ms:{HOLD_MS}ms"
          />
        </svg>

        <!-- "More inside" badge: tells you there's a hold menu -->
        {#if !menuOpen}
          <span
            class="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-fg text-surface"
            transition:fade={{ duration: 100 }}
            aria-hidden="true"
          >
            <Ellipsis size={12} strokeWidth={3} />
          </span>
        {/if}
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

  /* Circumference of r=34 is ~214. Empty by default, drains instantly on release. */
  .hold-ring {
    stroke-dasharray: 214;
    stroke-dashoffset: 214;
    opacity: 0;
    transition:
      stroke-dashoffset 120ms ease-out,
      opacity 120ms ease-out;
  }
  .hold-ring.filling {
    stroke-dashoffset: 0;
    opacity: 1;
    transition:
      stroke-dashoffset var(--hold-ms) linear,
      opacity 80ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .hold-ring.filling {
      transition: opacity 80ms ease-out;
    }
  }
</style>
