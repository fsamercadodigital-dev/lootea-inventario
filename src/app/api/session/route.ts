import { authorize, json, withRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (request) => {
  const session = await authorize(request);
  return json({ csrfToken: session.csrfToken, stepUpUntil: session.stepUpUntil });
});
