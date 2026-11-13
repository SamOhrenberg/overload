import { loadView } from '$lib/client/load';
import type { routinesView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = () => loadView<Awaited<ReturnType<typeof routinesView>>>('/routines');
