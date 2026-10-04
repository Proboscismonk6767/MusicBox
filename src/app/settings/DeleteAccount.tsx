"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type ActionResult } from "@/app/actions";

export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteAccount, null);
  return (
    <section className="mt-12 border border-danger/30 rounded-lg p-5">
      <h2 className="section-title !text-danger mb-2">Delete account</h2>
      <p className="text-sm text-muted mb-4">Permanently deletes your profile, diary, ratings, reviews, lists, comments, follows and notifications. This can&apos;t be undone.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-secondary !text-danger">Delete my account…</button>
      ) : (
        <form action={action} className="space-y-3 max-w-sm">
          <div>
            <label className="label" htmlFor="confirm">Type <span className="normal-case text-fg">{username}</span> to confirm</label>
            <input id="confirm" name="confirm" autoComplete="off" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="del-password">Password</label>
            <input id="del-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="input" />
          </div>
          {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="btn bg-danger text-white hover:bg-danger/90">{pending ? "Deleting…" : "Permanently delete"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
