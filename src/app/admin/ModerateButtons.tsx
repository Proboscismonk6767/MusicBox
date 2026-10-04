"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moderate } from "@/app/actions";
import { useApp } from "@/components/AppProvider";

export function ModerateButtons({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useApp();
  const [pending, start] = useTransition();
  const act = (a: "remove" | "dismiss" | "suspend") => start(async () => {
    if (a === "suspend" && !confirm("Suspend this account? They'll be signed out.")) return;
    const r = await moderate(id, a);
    if (!r.ok) return toast(r.error, "error");
    toast(a === "dismiss" ? "Report dismissed." : a === "remove" ? "Content removed." : "Account suspended.");
    router.refresh();
  });
  return (
    <div className="flex gap-2">
      <button disabled={pending} onClick={() => act("remove")} className="btn-secondary btn-sm">Remove content</button>
      <button disabled={pending} onClick={() => act("suspend")} className="btn-secondary btn-sm !text-danger">Suspend author</button>
      <button disabled={pending} onClick={() => act("dismiss")} className="btn-ghost btn-sm">Dismiss</button>
    </div>
  );
}
