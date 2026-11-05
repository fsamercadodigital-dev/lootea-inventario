import { AppError } from "@/lib/errors";
import { authorize, json, readJson, withRoute } from "@/lib/http";
import { getProfile, setProfileStatus, updateProfile } from "@/lib/repository";
import { parseProfileInput, parseStatusBody } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function profileId(context: { params: Promise<Record<string, string>> }): Promise<string> {
  const { id } = await context.params;
  if (!id) throw new AppError(404, "Perfil não encontrado.");
  return id;
}

export const GET = withRoute(async (request, context) => {
  await authorize(request);
  const profile = await getProfile(await profileId(context));
  if (!profile) throw new AppError(404, "Perfil não encontrado.");
  return json({ profile });
});

export const PATCH = withRoute(async (request, context) => {
  await authorize(request, { mutate: true });
  const id = await profileId(context);
  const body = await readJson(request);
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  if (keys.length === 1 && keys[0] === "status") {
    const status = parseStatusBody(body);
    if (!status.ok) throw new AppError(400, status.message);
    return json({ profile: await setProfileStatus(id, status.value) });
  }
  const parsed = parseProfileInput(body);
  if (!parsed.ok) throw new AppError(400, parsed.message);
  return json({ profile: await updateProfile(id, parsed.value) });
});
