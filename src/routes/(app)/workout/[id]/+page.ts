import { loadView } from '$lib/client/load';
import type { workoutView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => loadView<Awaited<ReturnType<typeof workoutView>>>(`/workouts/${params.id}`);
