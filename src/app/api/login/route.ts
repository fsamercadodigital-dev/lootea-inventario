import { login } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { clientIp, json, readJson, sessionCookie, verifyOrigin, withRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request) => {
  if (!verifyOrigin(request)) throw new AppError(403, "Origem recusada.");
  const body = await readJson(request);
  const passphrase =
    body && typeof body === "object" && "passphrase" in body && typeof body.passphrase === "string"
      ? body.passphrase
      : "";
  const session = await login(passphrase, clientIp(request));
  const response = json({ csrfToken: session.csrfToken });
  response.headers.append("set-cookie", sessionCookie(session.id, request, 60 * 60 * 12));
  return response;
});
