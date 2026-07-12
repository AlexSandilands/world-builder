// Every orchestrator call goes through here: relative `/api/...` paths only —
// vite's dev proxy (vite.config.ts) forwards them to ORCH_PORT, and the same
// relative paths work unchanged behind a production reverse proxy. No
// component fetches directly (docs/guidelines/frontend.md).
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ApiError(res.status, `${init?.method ?? 'GET'} ${path} -> ${res.status} ${detail}`)
  }
  return res
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  return (await res.json()) as T
}
