"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/actions";

export function MarkRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })} className="btn-ghost btn-sm">
      Mark all as read
    </button>
  );
}
