const API_BASE = process.env.NEXT_PUBLIC_API_URL || ""

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, (_, c) => `_${c.toLowerCase()}`)
}

function transformKeys(obj: unknown, transform: (key: string) => string): unknown {
  if (Array.isArray(obj)) return obj.map((v) => transformKeys(v, transform))
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        transform(k),
        transformKeys(v, transform),
      ]),
    )
  }
  return obj
}

async function request<T>(path: string, init?: RequestInit, retries = 1): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  // Retry on 429 (rate limit) and 503 (service unavailable) once
  if ((res.status === 429 || res.status === 503) && retries > 0) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "2", 10)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    return request<T>(path, init, retries - 1)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText || "Unknown error" }))
    throw new ApiError(res.status, body.detail ?? "Request failed")
  }

  if (res.status === 204) return undefined as T
  const data = await res.json()
  return transformKeys(data, snakeToCamel) as T
}

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "GET" }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: body !== undefined ? JSON.stringify(transformKeys(body, camelToSnake)) : undefined,
    }),

  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(transformKeys(body, camelToSnake)) : undefined,
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),

  postForm: <T>(path: string, form: FormData) =>
    fetch(`${API_BASE}/api/v1${path}`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Unknown error" }))
        throw new ApiError(res.status, body.detail ?? "Request failed")
      }
      const data = await res.json()
      return transformKeys(data, snakeToCamel) as T
    }),
}
