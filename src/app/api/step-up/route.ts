import { stepUp } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { authorize, clientIp, json, readJson, withRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request) => {
  const session = await authorize(request, { mutate: true });
  const body = await readJson(request);
  const passphrase =
    body && typeof body === "object" && "passphrase" in body && typeof body.passphrase === "string"
      ? body.passphrase
      : "";
  if (!passphrase) throw new AppError(401, "Frase de acesso incorreta.");
  const next = await stepUp(session.id, passphrase, clientIp(request));
  return json({ ok: true, stepUpUntil: next.stepUpUntil });
});
