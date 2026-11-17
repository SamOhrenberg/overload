import { loadView } from '$lib/client/load';
import type { exerciseEditView } from '$lib/server/views';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) =>
  loadView<Awaited<ReturnType<typeof exerciseEditView>>>(`/exercises/${params.id}/edit`);
