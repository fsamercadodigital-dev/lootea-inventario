import { AppError } from "@/lib/errors";
import { authorize, json, readJson, withRoute } from "@/lib/http";
import { createBm } from "@/lib/repository";
import { parseBmInput } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request) => {
  await authorize(request, { mutate: true });
  const parsed = parseBmInput(await readJson(request));
  if (!parsed.ok) throw new AppError(400, parsed.message);
  return json({ bm: await createBm(parsed.value) }, 201);
});
