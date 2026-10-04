"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard, UserMini } from "@/lib/views";
import { completeOnboarding, rateSong } from "@/app/actions";
import { Artwork } from "@/components/Artwork";
import { ArtistImage } from "@/components/cards";
import { StarInput } from "@/components/StarInput";
import { Avatar, Icon } from "@/components/ui";
import { Logo } from "@/components/Shell";
import { useApp } from "@/components/AppProvider";

type Artist = { id: string; name: string; slug: string; imageUrl?: string; hue: number };
type Person = UserMini & { reason: string; bio: string; logged: number };

const MAX_FAVOURITES = 8; // the server keeps at most 8 (see completeOnboarding)

export function Onboarding({ user, songs, artists, people, initialRatings }: { user: UserMini; songs: SongCard[]; artists: Artist[]; people: Person[]; initialRatings: Record<string, number> }) {
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState<Record<string, number>>(initialRatings);
  const [extra, setExtra] = useState<SongCard[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongCard[]>([]);
  const [aq, setAq] = useState("");
  const [favArtists, setFavArtists] = useState<Set<string>>(new Set());
  const [follow, setFollow] = useState<Set<string>>(new Set(people.slice(0, 3).map((p) => p.id)));
  const { toast } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  const rated = Object.keys(ratings).length;

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`);
      if (r.ok) setResults((await r.json()).songs);
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  const rate = (id: string, r: number | null) => {
    setRatings((x) => { const n = { ...x }; if (r == null) delete n[id]; else n[id] = r; return n; });
    rateSong(id, r).then((res) => !res.ok && toast(res.error, "error"));
  };
  const finish = () => start(async () => {
    const r = await completeOnboarding([...follow], [...favArtists]);
    if (!r.ok) return toast(r.error, "error");
    router.push("/");
    router.refresh();
  });

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n); };
  const toggleArtist = (id: string) => {
    if (!favArtists.has(id) && favArtists.size >= MAX_FAVOURITES) return toast(`You can pick up to ${MAX_FAVOURITES} favourites.`, "error");
    toggle(favArtists, id, setFavArtists);
  };
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shownArtists = aq.trim() ? artists.filter((a) => fold(a.name).includes(fold(aq.trim()))) : artists;
  const all = [...extra, ...songs.filter((s) => !extra.some((e) => e.id === s.id))];

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-line-soft">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Logo />
          <div className="flex-1 flex justify-center gap-1.5">
            {[0, 1, 2].map((s) => <span key={s} className={`h-1 w-10 rounded-full transition-colors ${s <= step ? "bg-accent" : "bg-line"}`} />)}
          </div>
          <span className="text-xs text-muted hidden sm:block">Hi, @{user.username}</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 pb-32">
        {step === 0 && (
          <div className="animate-fade-up">
            <h1 className="display text-4xl md:text-5xl">Rate a few songs you know.</h1>
            <p className="text-muted mt-2 mb-6">So we can understand your taste. Skip anything you haven&apos;t heard — about 10 is perfect.</p>
            <div className="relative max-w-md mb-8">
              <Icon name="search" size={15} className="absolute left-3 top-3 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a song you love…" className="input pl-9" />
              {results.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 card p-1 shadow-2xl shadow-black/60">
                  {results.map((s) => (
                    <button key={s.id} onClick={() => { setExtra([s, ...extra.filter((e) => e.id !== s.id)]); setQ(""); }} className="w-full flex items-center gap-3 p-2 rounded hover:bg-elev-2 text-left">
                      <Artwork cover={s.cover} size={36} /><div className="min-w-0"><div className="text-sm truncate">{s.title}</div><div className="text-xs text-muted">{s.artists[0]?.name}</div></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-6">
              {all.map((s) => (
                <div key={s.id} className={`transition-opacity ${ratings[s.id] ? "" : "opacity-90"}`}>
                  <div className="relative">
                    <Artwork cover={s.cover} />
                    {ratings[s.id] && <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-accent text-accent-ink flex items-center justify-center"><Icon name="check" size={12} strokeWidth={3} /></span>}
                  </div>
                  <div className="text-sm font-medium mt-1.5 truncate">{s.title}</div>
                  <div className="text-xs text-muted truncate mb-1">{s.artists[0]?.name}</div>
                  <StarInput value={ratings[s.id]} onChange={(r) => rate(s.id, r)} size={20} label={`Rate ${s.title}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-up">
            <h1 className="display text-4xl md:text-5xl">Pick some favourite artists.</h1>
            <p className="text-muted mt-2 mb-8">Choose up to {MAX_FAVOURITES} — they&apos;ll show on your profile and nudge your recommendations.</p>
            <div className="relative max-w-md mb-8">
              <Icon name="search" size={15} className="absolute left-3 top-3 text-faint" />
              <input value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Search artists…" aria-label="Search artists" className="input pl-9" />
            </div>
            {shownArtists.length === 0 && <p className="text-muted">No artists match &ldquo;{aq.trim()}&rdquo;.</p>}
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-8">
              {shownArtists.map((a) => {
                const on = favArtists.has(a.id);
                return (
                  <button key={a.id} onClick={() => toggleArtist(a.id)} aria-pressed={on} className="group text-center">
                    <div className={`relative rounded-full transition-all ${on ? "ring-2 ring-accent ring-offset-4 ring-offset-bg" : "opacity-80 group-hover:opacity-100"}`}>
                      <ArtistImage artist={a} className="text-2xl" />
                      {on && <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-accent text-accent-ink flex items-center justify-center"><Icon name="check" size={13} strokeWidth={3} /></span>}
                    </div>
                    <div className="text-sm mt-2 truncate">{a.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-up max-w-2xl">
            <h1 className="display text-4xl md:text-5xl">Follow people with great taste.</h1>
            <p className="text-muted mt-2 mb-8">Your feed is built from people, not an algorithm. Here are some matches.</p>
            <div className="space-y-1">
              {people.map((p) => {
                const on = follow.has(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-3 py-3 border-b border-line-soft">
                    <Avatar user={p} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.displayName} <span className="text-xs text-muted">@{p.username}</span></div>
                      <div className="text-xs text-accent/90">{p.reason} · {p.logged} logged</div>
                      <p className="text-xs text-muted truncate">{p.bio}</p>
                    </div>
                    <button onClick={() => toggle(follow, p.id, setFollow)} className={`${on ? "btn-secondary" : "btn-primary"} btn-sm min-w-[84px]`}>{on ? "Following" : "Follow"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-bg/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <span className="text-sm text-muted">
            {step === 0 && <>{rated} rated {rated < 10 && <span className="text-faint">· {10 - rated} more recommended</span>}</>}
            {step === 1 && <>{favArtists.size} of {MAX_FAVOURITES} selected</>}
            {step === 2 && <>{follow.size} to follow</>}
          </span>
          <div className="ml-auto flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-ghost">Back</button>}
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)} className="btn-primary min-w-28">{step === 0 && rated === 0 ? "Skip" : "Continue"}</button>
            ) : (
              <button onClick={finish} disabled={pending} className="btn-primary min-w-28">{pending ? "Building your feed…" : "Finish"}</button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
