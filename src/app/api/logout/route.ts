import { destroySession } from "@/lib/auth";
import { authorize, clearCookie, json, withRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request) => {
  const session = await authorize(request, { mutate: true });
  await destroySession(session.id);
  const response = json({ ok: true });
  response.headers.append("set-cookie", clearCookie(request));
  return response;
});
