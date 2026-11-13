/** Display names for the three speed zones, per exercise type. */
export type ZoneLabels = { walk: string; jog: string; sprint: string };

/**
 * Effort-zone labels for an exercise. Running keeps Walk/Jog/Sprint; wheel/row
 * cardio reads more naturally as Easy/Tempo/Sprint (same underlying zones).
 */
export function zoneLabelsFor(name = ''): ZoneLabels {
  const n = name.toLowerCase();
  if (n.includes('cycl') || n.includes('bike') || n.includes('row')) {
    return { walk: 'Easy', jog: 'Tempo', sprint: 'Sprint' };
  }
  return { walk: 'Walk', jog: 'Jog', sprint: 'Sprint' };
}

/** Human-readable target label from a stored recommendation target. */
export function targetLabel(target: Record<string, any>, unit = 'lb', name = ''): string {
  if (!target) return '—';

  // Running speed zones (jog base + sprint intervals)
  if (target.metric === 'run_zones') {
    if (target.note === 'baseline') return 'Set your baseline';
    const z = zoneLabelsFor(name);
    const parts: string[] = [];
    if (target.jog?.holdSec != null) parts.push(`${z.jog} ${clock(target.jog.holdSec)}`);
    if (target.sprint?.reps != null && target.sprint?.intervalSec != null) {
      parts.push(`${target.sprint.reps}×${clock(target.sprint.intervalSec)} ${z.sprint.toLowerCase()}`);
    }
    return parts.join(' · ') || '—';
  }

  // Cardio
  if (target.metric === 'distance' && target.distance != null) {
    return `${target.distance} ${unit}`;
  }
  if (target.durationSec != null) {
    return `${Math.round(target.durationSec / 60)} min`;
  }
  if (target.targetPaceSec != null) {
    const p = target.targetPaceSec;
    return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')}/${unit}`;
  }

  // Resistance
  const sets = target.sets ?? 3;
  let reps: string;
  if (target.reps != null) reps = String(target.reps);
  else if (target.repLow != null && target.repHigh != null) reps = `${target.repLow}–${target.repHigh}`;
  else reps = String(target.repLow ?? '');

  if (target.weight != null) return `${sets} × ${reps} @ ${target.weight} ${unit}`;
  return `${sets} × ${reps}`;
}

export function clock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.max(0, totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Local calendar date as YYYY-MM-DD (matches the DATE columns we compare to). */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Group color-token keys and the CSS var each maps to, for routine groups. */
export const GROUP_COLORS = [
  { key: 'strength', var: 'var(--goal-strength)' },
  { key: 'endurance', var: 'var(--goal-endurance)' },
  { key: 'stamina', var: 'var(--goal-stamina)' },
  { key: 'accent', var: 'var(--accent)' },
  { key: 'warning', var: 'var(--warning)' },
  { key: 'danger', var: 'var(--danger)' }
] as const;

/** Resolve a stored group color key to a CSS var, defaulting to the accent. */
export function groupColorVar(key?: string | null): string {
  return GROUP_COLORS.find((c) => c.key === key)?.var ?? 'var(--accent)';
}

/** Weekday labels, index 0 = Sunday, matching JS Date.getDay(). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];
