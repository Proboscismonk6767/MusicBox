import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { AuthForm } from "@/components/AuthForm";
import { demoDataEnabled } from "@/lib/server/env";
import { safeRedirectPath } from "@/lib/server/security";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getViewer()) redirect("/");
  const { next } = await searchParams;
  return <AuthForm mode="login" next={safeRedirectPath(next)} showDemo={demoDataEnabled()} />;
}
