import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getViewer()) redirect("/");
  return <AuthForm mode="signup" />;
}
