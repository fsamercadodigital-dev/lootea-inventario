import { AppError } from "@/lib/errors";
import { authorize, json, readJson, withRoute } from "@/lib/http";
import { revealSecret } from "@/lib/repository";
import { parseReveal } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request, context) => {
  await authorize(request, { mutate: true });
  const { id } = await context.params;
  const parsed = parseReveal(await readJson(request));
  if (!parsed.ok) throw new AppError(400, parsed.message);
  const value = await revealSecret(id, parsed.value.service, parsed.value.field);
  return json({ value });
});
