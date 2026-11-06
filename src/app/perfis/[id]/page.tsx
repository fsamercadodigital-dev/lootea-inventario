import { notFound } from "next/navigation";
import { ProfileEditor } from "@/components/profile-editor";
import { requireUser } from "@/lib/page-session";
import { getProfile, listBms } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [session, { id }] = await Promise.all([requireUser(), params]);
  const [detail, bms] = await Promise.all([getProfile(id), listBms()]);
  if (!detail) notFound();
  return <ProfileEditor detail={detail} bms={bms} csrfToken={session.csrfToken} />;
}
