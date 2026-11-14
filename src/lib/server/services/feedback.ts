import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { feedback, type FeedbackKind } from '$lib/server/db/schema';
import { env } from '$lib/server/config';

/**
 * In-app feedback. Every submission is saved locally first, then filed as a
 * GitHub issue when GITHUB_FEEDBACK_REPO + GITHUB_FEEDBACK_TOKEN are set. The
 * stored issue number lets the submitter come back and see whether it was
 * closed and read any replies. Issues never carry the username — the repo may
 * be public — the link back to the user lives only in our database.
 *
 * If GitHub is down or unconfigured at submit time the row keeps a null issue
 * number and is retried the next time its owner lists their feedback.
 */

export const FEEDBACK_KINDS: FeedbackKind[] = ['bug', 'idea', 'other'];
const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idea', other: 'Feedback' };

export type FeedbackStatus = 'open' | 'closed' | 'pending' | 'unknown';

export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  createdAt: string;
  issueNumber: number | null;
  issueUrl: string | null;
  status: FeedbackStatus;
  /** GitHub's close reason: "completed" | "not_planned" | null. */
  closedReason: string | null;
  commentCount: number;
  labels: string[];
  updatedAt: string | null;
};

export type FeedbackComment = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
};

export function githubEnabled(): boolean {
  return !!(env.GITHUB_FEEDBACK_REPO && env.GITHUB_FEEDBACK_TOKEN);
}

// ---------------------------------------------------------------------------
// GitHub REST
// ---------------------------------------------------------------------------

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(`https://api.github.com/repos/${env.GITHUB_FEEDBACK_REPO}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_FEEDBACK_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'overload-feedback',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      }
    });
  } finally {
    clearTimeout(t);
  }
}

type GhIssue = {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  state_reason: string | null;
  comments: number;
  labels: Array<{ name: string } | string>;
  updated_at: string;
};

/** Short-lived cache so flipping tabs doesn't burn the GitHub rate limit. */
const issueCache = new Map<number, { at: number; issue: GhIssue }>();
const ISSUE_TTL_MS = 60_000;

async function fetchIssue(n: number): Promise<GhIssue | null> {
  const hit = issueCache.get(n);
  if (hit && Date.now() - hit.at < ISSUE_TTL_MS) return hit.issue;
  try {
    const res = await gh(`/issues/${n}`);
    if (!res.ok) return null;
    const issue = (await res.json()) as GhIssue;
    issueCache.set(n, { at: Date.now(), issue });
    return issue;
  } catch {
    return null;
  }
}

function issueBody(row: { kind: FeedbackKind; body: string }, context: string | null): string {
  const parts = [row.body.trim() || '_No details provided._'];
  if (context) parts.push('', '---', '<sub>' + context + '</sub>');
  parts.push('', '<sub>Submitted from the in-app feedback form.</sub>');
  return parts.join('\n');
}

/** File one stored row as an issue. Returns the issue, or null on failure. */
async function fileIssue(
  row: typeof feedback.$inferSelect,
  context: string | null
): Promise<{ number: number; url: string } | null> {
  if (!githubEnabled()) return null;
  const payload = {
    title: `[${KIND_LABEL[row.kind]}] ${row.title}`,
    body: issueBody(row, context),
    labels: [...env.GITHUB_FEEDBACK_LABELS, ...(row.kind === 'bug' ? ['bug'] : row.kind === 'idea' ? ['enhancement'] : [])]
  };
  try {
    let res = await gh('/issues', { method: 'POST', body: JSON.stringify(payload) });
    // A token without label permission (or a validation hiccup) → retry bare.
    if (res.status === 422 || res.status === 403) {
      res = await gh('/issues', {
        method: 'POST',
        body: JSON.stringify({ title: payload.title, body: payload.body })
      });
    }
    if (!res.ok) {
      console.warn(`[feedback] GitHub issue create failed: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }
    const issue = (await res.json()) as GhIssue;
    issueCache.set(issue.number, { at: Date.now(), issue });
    await db
      .update(feedback)
      .set({ githubIssueNumber: issue.number, githubIssueUrl: issue.html_url })
      .where(eq(feedback.id, row.id));
    return { number: issue.number, url: issue.html_url };
  } catch (e) {
    console.warn('[feedback] GitHub issue create failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function submitFeedback(
  userId: string,
  data: { kind: FeedbackKind; title: string; body: string; context: string | null }
): Promise<FeedbackItem> {
  const [row] = await db
    .insert(feedback)
    .values({ userId, kind: data.kind, title: data.title, body: data.body })
    .returning();
  const filed = await fileIssue(row, data.context);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    issueNumber: filed?.number ?? null,
    issueUrl: filed?.url ?? null,
    status: filed ? 'open' : 'pending',
    closedReason: null,
    commentCount: 0,
    labels: [],
    updatedAt: null
  };
}

export async function listFeedback(userId: string): Promise<FeedbackItem[]> {
  // Retry anything that didn't make it to GitHub at submit time.
  if (githubEnabled()) {
    const unfiled = await db
      .select()
      .from(feedback)
      .where(and(eq(feedback.userId, userId), isNull(feedback.githubIssueNumber)))
      .limit(5);
    for (const row of unfiled) await fileIssue(row, null);
  }

  const rows = await db
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt))
    .limit(50);

  return Promise.all(
    rows.map(async (row): Promise<FeedbackItem> => {
      const issue =
        githubEnabled() && row.githubIssueNumber ? await fetchIssue(row.githubIssueNumber) : null;
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        issueNumber: row.githubIssueNumber,
        issueUrl: row.githubIssueUrl,
        status: issue ? issue.state : row.githubIssueNumber ? 'unknown' : 'pending',
        closedReason: issue?.state_reason ?? null,
        commentCount: issue?.comments ?? 0,
        labels: (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
        updatedAt: issue?.updated_at ?? null
      };
    })
  );
}

/** Replies on one of the user's own issues. Null if it isn't theirs. */
export async function feedbackComments(userId: string, id: string): Promise<FeedbackComment[] | null> {
  const [row] = await db
    .select({ n: feedback.githubIssueNumber })
    .from(feedback)
    .where(and(eq(feedback.id, id), eq(feedback.userId, userId)));
  if (!row) return null;
  if (!row.n || !githubEnabled()) return [];
  try {
    const res = await gh(`/issues/${row.n}/comments?per_page=100`);
    if (!res.ok) return [];
    const list = (await res.json()) as Array<{
      id: number;
      user: { login: string } | null;
      body: string | null;
      created_at: string;
    }>;
    return list.map((c) => ({
      id: c.id,
      author: c.user?.login ?? 'unknown',
      body: c.body ?? '',
      createdAt: c.created_at
    }));
  } catch {
    return [];
  }
}
