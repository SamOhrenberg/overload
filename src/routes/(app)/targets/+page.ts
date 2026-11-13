import { loadView } from '$lib/client/load';
import type { targetsView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = () => loadView<Awaited<ReturnType<typeof targetsView>>>('/targets');
