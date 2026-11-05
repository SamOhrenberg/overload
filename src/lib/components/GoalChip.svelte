<script lang="ts">
  type Goal = 'strength' | 'endurance' | 'stamina';
  let { goal }: { goal: Goal } = $props();

  const label: Record<Goal, string> = {
    strength: 'Strength',
    endurance: 'Endurance',
    stamina: 'Stamina'
  };
  const cls: Record<Goal, string> = {
    strength: 'bg-goal-strength-soft text-goal-strength',
    endurance: 'bg-goal-endurance-soft text-goal-endurance',
    stamina: 'bg-goal-stamina-soft text-goal-stamina'
  };
</script>

<span
  class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-semibold {cls[
    goal
  ]}"
>
  {label[goal]}
</span>
