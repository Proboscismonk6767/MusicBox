import Link from "next/link";
import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Terms", description: "The rules for using MusicBox." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <section>
        <h2>Using MusicBox</h2>
        <p>By creating an account or using MusicBox you agree to these terms and to our <Link href="/privacy">Privacy</Link> page. If you don&apos;t agree, please don&apos;t use the service. You must be at least 13 years old.</p>
      </section>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>Keep your password safe. You&apos;re responsible for what happens under your account.</li>
          <li>One person, one account. Don&apos;t impersonate others or pick a name meant to mislead.</li>
          <li>Tell us if you think someone else has accessed your account.</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>What you write (reviews, memories, lists, comments) is yours. By posting it you give MusicBox a worldwide, non-exclusive licence to store it, display it to the people your privacy settings allow, and show it in previews and search, for as long as it&apos;s on the service. This licence ends when you delete the content or your account (aside from copies in backups that rotate out).</p>
        <p>Only post things you have the right to post.</p>
      </section>

      <section>
        <h2>Community rules</h2>
        <p>MusicBox is a place for talking about music. Don&apos;t:</p>
        <ul>
          <li>harass, threaten or demean people, or post hateful content;</li>
          <li>post illegal content, other people&apos;s private information, or sexual content involving minors;</li>
          <li>spam, run fake or paid-for ratings, or manipulate rankings;</li>
          <li>scrape the service, or get around rate limits and other protections;</li>
          <li>try to break, probe or overload the service.</li>
        </ul>
        <p>Anyone can report a review, comment, list or user. Moderators may remove content, restrict features or suspend accounts that break these rules, and we may do so without notice where it&apos;s needed to protect people.</p>
      </section>

      <section>
        <h2>Music, artwork and third-party data</h2>
        <p>Song, album and artist information comes from open and third-party catalogues and may contain mistakes. Artwork and names belong to their owners and are shown to identify the music. MusicBox doesn&apos;t host or stream audio. See <Link href="/copyright">Copyright</Link> for how to report something that shouldn&apos;t be here.</p>
      </section>

      <section>
        <h2>The service itself</h2>
        <p>We work hard to keep MusicBox running and your diary safe, but it&apos;s provided &ldquo;as is&rdquo;. We don&apos;t promise it will always be available or error-free, and features may change. Keep your own copy of anything precious: Settings → Your data lets you download it.</p>
        <p>To the extent the law allows, MusicBox isn&apos;t liable for indirect or consequential losses, and our total liability to you is limited to the greater of what you paid us in the past 12 months or 50 US dollars. Nothing here limits rights you have by law that can&apos;t be limited.</p>
      </section>

      <section>
        <h2>Ending things</h2>
        <p>You can delete your account at any time in Settings. We may suspend or end accounts that break these terms. Sections that are meant to survive (such as the limits of liability) do.</p>
      </section>

      <section>
        <h2>Changes and law</h2>
        <p>We may update these terms; if the change matters, we&apos;ll tell signed-in users before it applies. Using MusicBox afterwards means you accept the new terms. These terms are governed by the law of the place where the operator of MusicBox is established, and disputes go to the courts there, except where mandatory consumer law says otherwise.</p>
      </section>
    </LegalPage>
  );
}
