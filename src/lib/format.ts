/** Human-readable target label from a stored recommendation target. */
export function targetLabel(target: Record<string, any>, unit = 'lb'): string {
  if (!target) return '—';

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
