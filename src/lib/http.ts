import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { COOKIE_NAME, getSession, type Session } from "./auth";
import { VaultError } from "./crypto-box";
import { AppError } from "./errors";

export function json(body: unknown, status = 200, extra?: Record<string, string>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
}

export function toResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return json({ message: error.message, code: error.code }, error.status);
  }
  if (error instanceof VaultError) {
    const message =
      error.code === "decrypt"
        ? "Não foi possível ler este dado. A chave do servidor pode ter mudado."
        : "O cofre de acesso não está configurado neste servidor.";
    return json({ message, code: "vault_unconfigured" }, 503);
  }
  console.error("request-failed", error instanceof Error ? error.name : "unknown");
  return json({ message: "Não foi possível concluir. Tente de novo." }, 500);
}

export async function readJson(request: Request, max = 100_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > max) throw new AppError(413, "Conteúdo grande demais.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(400, "JSON inválido.");
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function requestHost(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("host");
}

export function verifyOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = requestHost(request);
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(request.url).protocol === "https:";
}

export function sessionCookie(sessionId: string, request: Request, maxAge: number): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (isHttps(request)) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(request: Request): string {
  return sessionCookie("", request, 0).replace(`${COOKIE_NAME}=`, `${COOKIE_NAME}=`);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  return ip.slice(0, 80) || "local";
}

export async function authorize(request: Request, options: { mutate?: boolean } = {}): Promise<Session> {
  const mutating = options.mutate || (request.method !== "GET" && request.method !== "HEAD");
  if (mutating && !verifyOrigin(request)) throw new AppError(403, "Origem recusada.");
  const session = await getSession(readCookie(request, COOKIE_NAME));
  if (!session) throw new AppError(401, "Sessão expirada. Entre de novo.");
  if (mutating) {
    const token = request.headers.get("x-csrf-token") ?? "";
    if (!token || !secureEqual(token, session.csrfToken)) {
      throw new AppError(403, "Não foi possível confirmar o envio. Atualize a página.");
    }
  }
  return session;
}

export function withRoute(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toResponse(error);
    }
  };
}
