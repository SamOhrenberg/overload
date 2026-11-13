import { loadView } from '$lib/client/load';
import type { exerciseDetailView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => loadView<Awaited<ReturnType<typeof exerciseDetailView>>>(`/exercises/${params.id}`);
