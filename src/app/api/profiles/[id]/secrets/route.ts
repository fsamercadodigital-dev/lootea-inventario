import { AppError } from "@/lib/errors";
import { authorize, json, readJson, withRoute } from "@/lib/http";
import { saveSecrets } from "@/lib/repository";
import { parseSecretPatch } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = withRoute(async (request, context) => {
  await authorize(request, { mutate: true });
  const { id } = await context.params;
  const parsed = parseSecretPatch(await readJson(request));
  if (!parsed.ok) throw new AppError(400, parsed.message);
  const profile = await saveSecrets(id, parsed.value);
  return json({
    profile: {
      id: profile.id,
      updatedAt: profile.updatedAt,
      hasAccess: profile.hasAccess,
      emailUsername: profile.emailUsername,
      meta: profile.meta,
      email: profile.email,
      vault: profile.vault,
    },
  });
});
