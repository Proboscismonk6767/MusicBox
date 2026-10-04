"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logout, updateSettings, type ActionResult } from "@/app/actions";
import { DeleteAccount } from "./DeleteAccount";
import { Avatar, Icon } from "@/components/ui";
import { useApp } from "@/components/AppProvider";

interface U { username: string; displayName: string; bio: string; location: string; website: string; avatarHue: number; profileVisibility: string }

export function SettingsForm({ user, isAdmin }: { user: U; isAdmin: boolean }) {
  const [state, action, pending] = useActionState<ActionResult<void> | null, FormData>(updateSettings, null);
  const [hue, setHue] = useState(user.avatarHue);
  const [name, setName] = useState(user.displayName);
  const { toast } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) { toast("Settings saved."); router.refresh(); }
  }, [state, toast, router]);

  return (
    <div className="max-w-2xl">
      <h1 className="display text-4xl mb-8">Settings</h1>
      <form action={action} className="space-y-10">
        <section className="space-y-4">
          <h2 className="section-title border-b border-line pb-2">Profile</h2>
          <div className="flex items-center gap-4">
            <Avatar user={{ username: user.username, displayName: name || user.username, avatarHue: hue }} size={64} />
            <div className="flex-1">
              <label className="label" htmlFor="hue">Avatar colour</label>
              <input id="hue" name="avatarHue" type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label" htmlFor="displayName">Display name</label><input id="displayName" name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input" /></div>
            <div><label className="label">Username</label><input value={`@${user.username}`} disabled className="input opacity-60" /></div>
          </div>
          <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" name="bio" defaultValue={user.bio} maxLength={300} rows={3} className="textarea" placeholder="What do you listen to?" /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label" htmlFor="location">Location</label><input id="location" name="location" defaultValue={user.location} maxLength={60} className="input" /></div>
            <div><label className="label" htmlFor="website">Website</label><input id="website" name="website" type="url" defaultValue={user.website} placeholder="https://" className="input" /></div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title border-b border-line pb-2">Privacy</h2>
          {[
            ["public", "Public", "Anyone can see your diary, reviews and lists."],
            ["followers", "Followers only", "Only people who follow you can see your activity."],
            ["private", "Private", "Only you can see your profile."],
          ].map(([v, l, d]) => (
            <label key={v} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="profileVisibility" value={v} defaultChecked={user.profileVisibility === v} className="mt-1 accent-[var(--color-accent)]" />
              <span><span className="block text-sm font-medium">{l}</span><span className="text-xs text-muted">{d}</span></span>
            </label>
          ))}
          <p className="text-xs text-faint pt-1">Individual lists also have their own visibility (public, unlisted, private).</p>
        </section>

        <section className="space-y-4">
          <h2 className="section-title border-b border-line pb-2">Change password</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label" htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" className="input" /></div>
            <div><label className="label" htmlFor="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" minLength={8} autoComplete="new-password" className="input" /></div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="section-title border-b border-line pb-2">Connections</h2>
          <div className="flex items-center justify-between gap-4 card p-4">
            <div>
              <div className="text-sm font-medium">Spotify import</div>
              <div className="text-xs text-muted">Bring in your Spotify listening history: your most-played songs become diary entries you can rate and review. Your export is read on this device and never uploaded.</div>
            </div>
            <Link href="/settings/import" className="btn-secondary btn-sm shrink-0">Import</Link>
          </div>
        </section>

        {state && !state.ok && <p className="text-sm text-danger" role="alert">{state.error}</p>}
        <div className="flex items-center gap-3 sticky bottom-16 md:bottom-0 bg-bg/90 backdrop-blur py-4 border-t border-line">
          <button disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save changes"}</button>
          <Link href={`/${user.username}`} className="btn-ghost">View profile</Link>
          {isAdmin && <Link href="/admin" className="btn-ghost"><Icon name="shield" size={14} /> Moderation</Link>}
        </div>
      </form>
      <form action={logout} className="mt-6"><button className="btn-secondary"><Icon name="logout" size={14} /> Sign out</button></form>
      <section className="mt-12 space-y-2">
        <h2 className="section-title border-b border-line pb-2">Your data</h2>
        <div className="flex items-center justify-between gap-4 card p-4">
          <div>
            <div className="text-sm font-medium">Download everything</div>
            <div className="text-xs text-muted">Your diary, ratings, reviews, lists, comments and follows in one JSON file. It&apos;s yours to keep or take elsewhere.</div>
          </div>
          <a href="/api/account/export" download className="btn-secondary btn-sm shrink-0">Download</a>
        </div>
      </section>
      <DeleteAccount username={user.username} />
    </div>
  );
}
