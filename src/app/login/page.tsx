import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isAuthConfigured } from "@/lib/auth";
import { currentSession } from "@/lib/page-session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  return <LoginForm configured={await isAuthConfigured()} />;
}
