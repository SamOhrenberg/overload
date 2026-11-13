import { loadView } from '$lib/client/load';
import type { exercisesView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = () => loadView<Awaited<ReturnType<typeof exercisesView>>>('/exercises');
