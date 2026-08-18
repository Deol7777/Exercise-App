/**
 * The browser's side of the REST contract (ADR 0003): every mutation is a fetch
 * to a route handler, because there are no Server Actions.
 *
 * The handlers answer failures as `{ error, fields? }` — see
 * src/app/api/_lib/respond.ts. This turns that into one thrown `ApiError`, so a
 * component branches on a caught error rather than on a status code.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      fields?: Record<string, string[] | undefined>;
    } | null;

    throw new ApiError(response.status, body?.error ?? "Something went wrong.", body?.fields);
  }

  /** 204 has no body; the caller of a delete is not expecting one. */
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
