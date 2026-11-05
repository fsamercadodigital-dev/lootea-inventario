"use client";

let csrfToken = "";

export function setCsrf(token: string) {
  csrfToken = token;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api(path: string, options: { method?: string; json?: unknown } = {}) {
  const headers = new Headers({ accept: "application/json" });
  const method = options.method ?? "GET";
  if (options.json !== undefined) headers.set("content-type", "application/json");
  if (method !== "GET" && method !== "HEAD") headers.set("x-csrf-token", csrfToken);
  const response = await fetch(path, {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401 && path !== "/api/login" && path !== "/api/step-up") {
    window.location.assign("/login");
  }
  return response;
}

export async function apiJson<T>(path: string, options: { method?: string; json?: unknown } = {}): Promise<T> {
  const response = await api(path, options);
  let body: { message?: string; code?: string } = {};
  try {
    body = (await response.json()) as { message?: string; code?: string };
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new ApiError(body.message || "Não foi possível concluir.", response.status, body.code);
  }
  return body as T;
}
