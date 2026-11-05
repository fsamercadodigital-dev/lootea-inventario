import { AppError } from "@/lib/errors";
import { authorize, json, readJson, withRoute } from "@/lib/http";
import { createProfile } from "@/lib/repository";
import { parseCreateProfile } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (request) => {
  await authorize(request, { mutate: true });
  const parsed = parseCreateProfile(await readJson(request));
  if (!parsed.ok) throw new AppError(400, parsed.message);
  return json({ profile: await createProfile(parsed.value) }, 201);
});
