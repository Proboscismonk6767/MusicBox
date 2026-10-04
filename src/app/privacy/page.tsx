import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Privacy", description: "What MusicBox collects, why, who can see it, and how to take it with you or delete it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <section>
        <h2>The short version</h2>
        <p>MusicBox is a diary for songs. We keep what you choose to put in it, we don&apos;t sell it, and we don&apos;t use advertising or cross-site tracking cookies. You can download everything or delete your account in Settings.</p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Your account:</strong> username, display name, and a password stored only as a salted hash (we can&apos;t read it). Bio, location, website and avatar colour are optional.</li>
          <li><strong>What you add:</strong> diary entries, ratings, reviews, memories, tags, lists, comments, likes, follows, blocks and mutes, and songs you save to listen later.</li>
          <li><strong>Imported listening history:</strong> if you import from Spotify, your export is read on your own device. Only song titles, artists, play counts and first and last listen dates for your most-played songs are sent to us. Your IP addresses, device details and podcasts in that export are never uploaded. Songs become diary entries; the temporary lookup queue is deleted when the import finishes.</li>
          <li><strong>Technical data:</strong> a single sign-in cookie that keeps you logged in (strictly necessary). Your IP address is used briefly to limit abuse and appears in security logs for events such as failed logins and rate limits.</li>
        </ul>
      </section>

      <section>
        <h2>Who can see it</h2>
        <p>That&apos;s up to you. Profiles can be public, followers-only or private, and lists can be public, unlisted or private. Reviews and diary entries follow your profile setting. People you block can&apos;t see your profile. Share previews of public pages (the image shown when a link is pasted into a chat app) only ever include what a signed-out visitor could already see.</p>
      </section>

      <section>
        <h2>Other services involved</h2>
        <ul>
          <li><strong>Music catalogue:</strong> when you search for or open a song that isn&apos;t on MusicBox yet, our server asks <a href="https://musicbrainz.org" rel="noopener noreferrer">MusicBrainz</a> (or Apple&apos;s iTunes Search) for it. The search words are sent; your account and identity are not.</li>
          <li><strong>Album artwork:</strong> covers come from the <a href="https://coverartarchive.org" rel="noopener noreferrer">Cover Art Archive</a> (run by the Internet Archive) and Apple. When a page shows these covers, your browser requests them directly, so those services can see your IP address as they would for any image.</li>
          <li><strong>Hosting and infrastructure:</strong> our hosting provider processes requests on our behalf.</li>
        </ul>
        <p>We don&apos;t host or stream audio. Links to Spotify, Apple Music and YouTube open those services, which have their own policies.</p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li><strong>Download your data</strong> as a JSON file: Settings → Your data.</li>
          <li><strong>Edit</strong> your profile, entries, reviews and lists any time.</li>
          <li><strong>Delete your account</strong> in Settings. Your profile, diary, ratings, reviews, lists, comments, follows and notifications are removed from our live database straight away. Copies in backups disappear as backups rotate.</li>
          <li>Depending on where you live you may have further rights (access, correction, objection, complaint to a regulator). Email us and we&apos;ll help.</li>
        </ul>
      </section>

      <section>
        <h2>How long we keep things</h2>
        <p>Your content stays until you delete it or your account. Security logs are kept only as long as needed to investigate abuse. Moderation records about content removed for breaking the rules may be kept longer.</p>
      </section>

      <section>
        <h2>Children</h2>
        <p>MusicBox isn&apos;t for children under 13. If you believe a child has created an account, contact us and we&apos;ll remove it.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>If we change how we handle your data in a way that matters, we&apos;ll update this page and tell signed-in users before it takes effect.</p>
      </section>
    </LegalPage>
  );
}
