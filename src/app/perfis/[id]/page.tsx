import { notFound } from "next/navigation";
import { ProfileEditor } from "@/components/profile-editor";
import { requireUser } from "@/lib/page-session";
import { getProfile, listInventory } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const detail = await getProfile(id);
  if (!detail) notFound();
  const inventory = await listInventory();
  return <ProfileEditor detail={detail} bms={inventory.bms} csrfToken={session.csrfToken} />;
}
