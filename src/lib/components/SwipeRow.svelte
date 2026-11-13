<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Trash2 } from 'lucide-svelte';

  let {
    ondelete,
    ontap,
    children
  }: {
    ondelete: () => void;
    ontap?: () => void;
    children: Snippet;
  } = $props();

  // Width of the revealed delete action when the row is snapped open.
  const REVEAL = 88;
  // Pointer travel (px) above which a gesture counts as a swipe, not a tap.
  const TAP_SLOP = 6;

  let fg = $state<HTMLElement>();
  let tx = $state(0); // current horizontal offset (<= 0)
  let dragging = $state(false);
  let removing = $state(false);
  let width = 0;
  let startX = 0;
  let startTx = 0;
  let moved = false;

  function down(e: PointerEvent) {
    if (removing || !fg) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startTx = tx;
    width = fg.offsetWidth;
    fg.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > TAP_SLOP) moved = true;
    let next = startTx + dx;
    if (next > 0) next = 0; // left swipe only
    if (next < -width) next = -width;
    tx = next;
  }

  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try {
      fg?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (!moved) {
      // A tap: open row closes, closed row activates.
      if (startTx < 0) tx = 0;
      else ontap?.();
      return;
    }

    // A swipe: reveal, snap, or — if dragged far enough — delete outright.
    const deleteThreshold = Math.max(REVEAL * 2, width * 0.45);
    if (-tx >= deleteThreshold) remove();
    else if (-tx >= REVEAL / 2) tx = -REVEAL;
    else tx = 0;
  }

  function remove() {
    if (removing) return;
    removing = true;
    tx = -(width || 400); // slide fully off before unmounting
    setTimeout(() => ondelete(), 160);
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tx < 0) tx = 0;
      else ontap?.();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove();
    }
  }
</script>

<div class="relative select-none overflow-hidden rounded-lg">
  <!-- Delete action, revealed underneath as the row slides left -->
  <button
    type="button"
    class="absolute inset-y-0 right-0 flex items-center justify-end bg-danger pr-6 text-white"
    style="width: {Math.max(REVEAL, -tx)}px"
    aria-label="Delete workout"
    onclick={remove}
  >
    <Trash2 size={22} />
  </button>

  <!-- Foreground card -->
  <div
    bind:this={fg}
    role="button"
    tabindex="0"
    class="relative touch-pan-y {dragging ? '' : 'transition-transform duration-200'}"
    style="transform: translateX({tx}px)"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  >
    {@render children()}
  </div>
</div>
