import { authorize, json, withRoute } from "@/lib/http";
import { listInventory } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async (request) => {
  await authorize(request);
  return json(await listInventory());
});
