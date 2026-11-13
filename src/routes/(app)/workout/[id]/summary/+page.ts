import { loadView } from '$lib/client/load';
import type { workoutSummaryView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => loadView<Awaited<ReturnType<typeof workoutSummaryView>>>(`/workouts/${params.id}/summary`);
