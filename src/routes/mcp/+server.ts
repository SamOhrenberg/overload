import { json } from '@sveltejs/kit';
import { readBearerToken } from '$lib/server/auth/session';
import { validateAccessToken, ALL_SCOPES, type McpAuth } from '$lib/server/auth/oauth';
import { TOOLS, ToolError } from '$lib/server/mcp/tools';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/**
 * MCP server over Streamable HTTP (stateless, JSON responses — no SSE stream).
 * Auth: OAuth 2.1 bearer token; discovery via /.well-known/oauth-protected-resource.
 */

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function unauthorized(origin: string, error?: string) {
  const parts = [`resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`, `scope="${ALL_SCOPES.join(' ')}"`];
  if (error) parts.unshift(`error="${error}"`);
  return json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } },
    { status: 401, headers: { 'WWW-Authenticate': `Bearer ${parts.join(', ')}` } }
  );
}

const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code, message }
});

async function handle(msg: RpcRequest, auth: McpAuth) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const asked = String(params.protocolVersion ?? '');
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'overload', title: 'Overload', version: '0.1.0' },
        instructions:
          "Overload is the user's workout tracker. Read their training data with the read tools " +
          '(start with get_profile, list_workouts or list_exercises), and use add_comment to leave ' +
          'feedback they will see in the app on a workout, exercise, or set. With the write ' +
          'permission you can also log workouts (create_workout takes exercises, sets and cardio ' +
          'in one call), correct sets, manage custom exercises and goals, build routines and the ' +
          'weekly schedule, and adjust next-session targets. Look ids up with the read tools first ' +
          '(exercises via list_exercises — prefer built-ins over creating duplicates), and confirm ' +
          'with the user before deleting anything. Weights are in the ' +
          "exercise's unit; RIR = reps in reserve."
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return {
        tools: TOOLS.filter((t) => auth.scopes.includes(t.scope)).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: {
            title: t.title,
            readOnlyHint: t.readOnly,
            destructiveHint: !t.readOnly && (t.destructive ?? false),
            idempotentHint: t.readOnly || (t.idempotent ?? false),
            openWorldHint: false
          }
        }))
      };
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${String(params.name)}`), { code: -32602 });
      if (!auth.scopes.includes(tool.scope)) {
        return toolResult(`This connection was not granted the "${tool.scope}" permission.`, true);
      }
      try {
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        if (typeof args !== 'object' || Array.isArray(args)) throw new ToolError('arguments must be an object.');
        const out = await tool.run(auth, args);
        return toolResult(JSON.stringify(out, null, 2), false);
      } catch (e) {
        if (e instanceof ToolError) return toolResult(e.message, true);
        console.error(`[mcp] ${tool.name} failed:`, e);
        return toolResult('Internal error while running the tool.', true);
      }
    }
    case 'resources/list':
      return { resources: [] };
    case 'prompts/list':
      return { prompts: [] };
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601, id });
  }
}

const toolResult = (text: string, isError: boolean) => ({ content: [{ type: 'text', text }], isError });

async function respond(msg: unknown, auth: McpAuth) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, -32600, 'Invalid request');
  const req = msg as RpcRequest;
  // Notifications and client responses carry no id and get no reply.
  if (req.id === undefined) return null;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return rpcError(req.id, -32600, 'Invalid request');
  }
  try {
    return { jsonrpc: '2.0', id: req.id, result: await handle(req, auth) };
  } catch (e) {
    const code = (e as { code?: number }).code ?? -32603;
    return rpcError(req.id, code, e instanceof Error ? e.message : 'Internal error');
  }
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  const token = readBearerToken(request);
  if (!token) return unauthorized(url.origin);
  const auth = await validateAccessToken(token, `${url.origin}/mcp`);
  if (!auth) return unauthorized(url.origin, 'invalid_token');

  if (!rateLimit(`mcp:${auth.userId}:${getClientAddress()}`, 120, 60_000)) {
    return json(rpcError(null, -32000, 'Rate limit exceeded'), { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => respond(m, auth)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const out = await respond(body, auth);
  return out ? json(out) : new Response(null, { status: 202 });
};

// Stateless server: no server-initiated SSE stream and no sessions to end.
const notAllowed: RequestHandler = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
