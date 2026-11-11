<script lang="ts">
  type Point = { t: number; y: number; pr?: boolean };
  type Props = { points: Point[]; color?: string; height?: number };
  let { points, color = 'var(--accent)', height = 120 }: Props = $props();

  const W = 320;
  const PAD = 8;

  let path = $derived.by(() => {
    if (points.length < 2) return '';
    const xs = points.map((p) => p.t);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const sx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - 2 * PAD);
    const sy = (y: number) => height - PAD - ((y - minY) / (maxY - minY || 1)) * (height - 2 * PAD);
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.t).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  });

  let dots = $derived.by(() => {
    if (points.length < 2) return [];
    const xs = points.map((p) => p.t);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const sx = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - 2 * PAD);
    const sy = (y: number) => height - PAD - ((y - minY) / (maxY - minY || 1)) * (height - 2 * PAD);
    return points.filter((p) => p.pr).map((p) => ({ cx: sx(p.t), cy: sy(p.y) }));
  });
</script>

{#if points.length < 2}
  <div class="flex h-28 items-center justify-center rounded-lg bg-surface text-caption text-fg-muted">
    Log a couple of sessions to see your trend.
  </div>
{:else}
  <svg viewBox={`0 0 ${W} ${height}`} class="w-full rounded-lg bg-surface" role="img" aria-label="Trend">
    <path d={path} fill="none" stroke={color} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    {#each dots as d}
      <circle cx={d.cx} cy={d.cy} r="4" fill="var(--pr)" />
    {/each}
  </svg>
{/if}
