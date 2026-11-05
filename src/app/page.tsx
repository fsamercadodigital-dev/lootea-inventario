import { Dashboard } from "@/components/dashboard";
import { requireUser } from "@/lib/page-session";
import { listInventory } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireUser();
  const inventory = await listInventory();
  return <Dashboard initial={inventory} csrfToken={session.csrfToken} />;
}
