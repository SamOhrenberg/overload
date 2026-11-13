/** Shapes returned by the /api/view/* endpoints and rendered by the pages. */

export type TodayCard = {
  exerciseId: string;
  recId: string | null;
  name: string;
  unit: string;
  goal: 'strength' | 'endurance' | 'stamina';
  target: string;
  rawTarget: Record<string, unknown> | null;
  rationale: string | null;
  lastSummary: string | null;
  status: 'ready' | 'done';
  tracksSpeedZones: boolean;
};

export type TargetRow = {
  exerciseId: string;
  recId: string | null;
  name: string;
  unit: string;
  goal: 'strength' | 'endurance' | 'stamina';
  target: string;
  rawTarget: Record<string, unknown> | null;
  rationale: string | null;
  lastSummary: string | null;
  lastPerformed: string | null;
};
