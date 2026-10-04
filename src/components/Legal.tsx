import Link from "next/link";
import type { ReactNode } from "react";

// Shared frame for Terms, Privacy and Copyright. The text is a plain-English
// starting point that describes what MusicBox actually does; it shows a draft
// notice until the operator sets NEXT_PUBLIC_LEGAL_REVIEWED=true (after a
// lawyer has read it and the contact details are real).

export const LEGAL_UPDATED = "4 October 2026";
export const contactEmail = () => process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const reviewed = process.env.NEXT_PUBLIC_LEGAL_REVIEWED === "true";
  const email = contactEmail();
  return (
    <article className="max-w-2xl mx-auto">
      <h1 className="display text-4xl md:text-5xl mb-2">{title}</h1>
      <p className="text-sm text-muted mb-8">Last updated {LEGAL_UPDATED}</p>
      {!reviewed && (
        <p role="note" className="card p-4 mb-8 text-sm text-muted border-accent/40">
          <strong className="text-fg">Draft.</strong> This document describes how MusicBox works but hasn&apos;t been reviewed by a lawyer yet.
        </p>
      )}
      <div className="space-y-8 text-[15px] leading-relaxed text-fg/90 [&_h2]:display [&_h2]:text-2xl [&_h2]:mb-2 [&_h2]:text-fg [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-accent [&_a:hover]:underline">
        {children}
        <section>
          <h2>Contact</h2>
          <p>{email ? <>Questions about this page, or anything else: <a href={`mailto:${email}`}>{email}</a>.</> : "Contact details are published here once the service is live."}</p>
        </section>
      </div>
      <nav className="mt-12 pt-6 border-t border-line text-sm text-muted flex gap-4" aria-label="Legal">
        <Link href="/terms" className="hover:text-fg">Terms</Link>
        <Link href="/privacy" className="hover:text-fg">Privacy</Link>
        <Link href="/copyright" className="hover:text-fg">Copyright</Link>
      </nav>
    </article>
  );
}

export function SiteFooter() {
  return (
    <footer className="max-w-[1240px] mx-auto px-4 pb-24 md:pb-10 pt-4 text-xs text-faint flex flex-wrap gap-x-5 gap-y-1">
      <span>© MusicBox</span>
      <Link href="/terms" className="hover:text-fg">Terms</Link>
      <Link href="/privacy" className="hover:text-fg">Privacy</Link>
      <Link href="/copyright" className="hover:text-fg">Copyright</Link>
    </footer>
  );
}
