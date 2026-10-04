"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewView } from "@/lib/views";
import { deleteEntry } from "@/app/actions";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/ui";

export function EntryActions({ entry, redirectTo }: { entry: ReviewView & { context?: string; memory?: string }; redirectTo?: string }) {
  const { openLog, toast } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        onClick={() => openLog({ song: entry.song, entry: { id: entry.id, listenedAt: entry.listenedAt, rating: entry.rating, liked: entry.liked, review: entry.review, hasSpoiler: entry.hasSpoiler, tags: entry.tags, isRelisten: entry.isRelisten, context: entry.context, memory: entry.memory } })}
        className="btn-ghost h-8 w-8 px-0" aria-label="Edit entry" title="Edit"
      >
        <Icon name="settings" size={14} />
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete this diary entry for “${entry.song.title}”? This can't be undone.`)) return;
          start(async () => {
            const r = await deleteEntry(entry.id);
            if (!r.ok) return toast(r.error, "error");
            toast("Entry deleted.");
            if (redirectTo) router.push(redirectTo);
            else router.refresh();
          });
        }}
        className="btn-ghost h-8 w-8 px-0 hover:!text-danger" aria-label="Delete entry" title="Delete"
      >
        <Icon name="x" size={14} />
      </button>
    </>
  );
}
