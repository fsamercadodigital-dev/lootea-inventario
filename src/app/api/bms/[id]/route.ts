import { AppError } from "@/lib/errors";
import { authorize, json, readJson, withRoute } from "@/lib/http";
import { setBmStatus, updateBm } from "@/lib/repository";
import { parseBmInput, parseStatusBody } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withRoute(async (request, context) => {
  await authorize(request, { mutate: true });
  const { id } = await context.params;
  const body = await readJson(request);
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  if (keys.length === 1 && keys[0] === "status") {
    const status = parseStatusBody(body);
    if (!status.ok) throw new AppError(400, status.message);
    return json({ bm: await setBmStatus(id, status.value) });
  }
  const parsed = parseBmInput(body, "update");
  if (!parsed.ok) throw new AppError(400, parsed.message);
  return json({ bm: await updateBm(id, parsed.value) });
});
