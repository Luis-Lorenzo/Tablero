export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : "UNKNOWN_ERROR";
    throw new ApiError(code, response.status);
  }

  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body })
};
