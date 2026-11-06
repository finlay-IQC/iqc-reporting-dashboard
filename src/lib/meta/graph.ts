import "server-only";

/**
 * Minimal Meta Graph API client. One System User token (META_ACCESS_TOKEN)
 * covers every client ad account it's been assigned to.
 */
const VERSION = () => (process.env.META_API_VERSION || "v24.0").trim();
const BASE = () => (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/+$/, "");

export class MetaApiError extends Error {
  constructor(message: string, readonly code?: number, readonly subcode?: number) {
    super(message);
  }
}

function token(): string {
  const t = (process.env.META_ACCESS_TOKEN ?? "").trim();
  if (!t) throw new MetaApiError("META_ACCESS_TOKEN isn't set. Add the System User token in Vercel and redeploy.");
  return t;
}

function explain(code: number | undefined, message: string): string {
  if (code === 190) return `Meta token is invalid or expired — generate a new System User token. (${message})`;
  if (code === 200 || code === 10 || (code === 100 && /permission/i.test(message)))
    return `Meta says the token doesn't have access to this ad account. Assign the ad account to the System User in Business Settings. (${message})`;
  if ([4, 17, 32, 613, 80000, 80003, 80004].includes(code ?? -1)) return `Meta rate limit hit — the next sync will catch up. (${message})`;
  return message;
}

async function request(url: string, attempt = 0): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean } };
  if (res.ok && !body.error) return body;
  const err = body.error ?? {};
  if ((err.is_transient || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return request(url, attempt + 1);
  }
  throw new MetaApiError(explain(err.code, err.message ?? `HTTP ${res.status}`), err.code, err.error_subcode);
}

export async function graphGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return (await request(`${BASE()}/${VERSION()}/${path.replace(/^\//, "")}?${qs}`)) as T;
}

/** Follows `paging.next` until exhausted (or maxPages). */
export async function graphGetAll<T>(path: string, params: Record<string, string | number> = {}, maxPages = 200): Promise<T[]> {
  type Page = { data?: T[]; paging?: { next?: string } };
  const out: T[] = [];
  let page = await graphGet<Page>(path, { limit: 500, ...params });
  for (let i = 0; ; i++) {
    out.push(...(page.data ?? []));
    const next = page.paging?.next;
    if (!next || i >= maxPages) break;
    // Meta's next URL is absolute; keep our base (useful for tests) but its query.
    const u = new URL(next);
    page = (await request(`${BASE()}${u.pathname}${u.search}`)) as Page;
  }
  return out;
}
