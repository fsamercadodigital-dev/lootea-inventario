import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, getSession, isAuthConfigured, type Session } from "./auth";

export async function currentSession(): Promise<Session | null> {
  if (!(await isAuthConfigured())) return null;
  const jar = await cookies();
  return getSession(jar.get(COOKIE_NAME)?.value);
}

export async function requireUser(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}
