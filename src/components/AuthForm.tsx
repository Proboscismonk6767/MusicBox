"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type ActionResult } from "@/app/actions";
import { Logo } from "./Shell";

export function AuthForm({ mode, next, showDemo = false }: { mode: "login" | "signup"; next?: string; showDemo?: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(mode === "login" ? login : signup, null);
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm mx-auto">
          <Logo className="mb-10" />
          <h1 className="display text-4xl mb-2">{mode === "login" ? "Welcome back." : "Start your music diary."}</h1>
          <p className="text-muted mb-8 text-sm">{mode === "login" ? "Sign in to log, rate and review." : "It takes about a minute. Rate a few songs and we'll handle the rest."}</p>
          <form action={action} className="space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input id="username" name="username" required autoComplete="username" autoFocus className="input" placeholder={mode === "signup" ? "e.g. nightsfan" : ""} pattern={mode === "signup" ? "[a-zA-Z0-9_]{3,24}" : undefined} title="3–24 letters, numbers or underscores" />
            </div>
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="displayName">Display name</label>
                <input id="displayName" name="displayName" autoComplete="name" className="input" placeholder="Optional" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : undefined} maxLength={256} autoComplete={mode === "login" ? "current-password" : "new-password"} className="input" />
            </div>
            {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.error}</p>}
            <button disabled={pending} className="btn-primary w-full h-11">{pending ? "One sec…" : mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          {mode === "signup" && <p className="text-xs text-faint mt-3">By creating an account you agree to the <Link href="/terms" className="underline hover:text-fg">Terms</Link> and <Link href="/privacy" className="underline hover:text-fg">Privacy</Link> page.</p>}
          <p className="text-sm text-muted mt-6">
            {mode === "login" ? <>New here? <Link href="/signup" className="text-accent hover:underline">Create an account</Link></> : <>Already have one? <Link href="/login" className="text-accent hover:underline">Sign in</Link></>}
          </p>
          {mode === "login" && showDemo && <p className="text-xs text-faint mt-8 border-t border-line pt-4">Demo: any seeded user (e.g. <code className="text-muted">abtin</code>, <code className="text-muted">alex</code>, <code className="text-muted">maya</code>) with password <code className="text-muted">musicbox-demo</code>.</p>}
        </div>
      </div>
      <div className="hidden lg:flex relative overflow-hidden border-l border-line-soft bg-elev items-end p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(242,181,68,0.18),transparent_60%)]" />
        <blockquote className="relative">
          <p className="display text-5xl leading-tight max-w-lg">“Somehow this still gets better every time.”</p>
          <footer className="mt-4 text-muted text-sm">— a review of <span className="text-fg">Nights</span>, Frank Ocean · ★★★★★</footer>
        </blockquote>
      </div>
    </div>
  );
}
