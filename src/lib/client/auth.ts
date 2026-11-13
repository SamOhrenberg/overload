import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { api, errorMessage, resetBase, setToken } from './api';

/**
 * POST credentials to /api/auth/login or /api/auth/join, store the returned
 * bearer token, and enter the app. Returns an error message on failure.
 */
export async function authenticate(path: string, body: Record<string, string>): Promise<string | null> {
  resetBase();
  let res: Response;
  try {
    res = await api(path, { method: 'POST', body: JSON.stringify(body) });
  } catch {
    return "Couldn't reach the server. Check your connection or the server address.";
  }
  if (!res.ok) return errorMessage(res);
  const { token } = (await res.json()) as { token: string };
  setToken(token);
  await goto(resolve('/'), { invalidateAll: true });
  return null;
}
