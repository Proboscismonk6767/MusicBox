import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Copyright", description: "How to report content on MusicBox that infringes your copyright." };

export default function CopyrightPage() {
  return (
    <LegalPage title="Copyright">
      <section>
        <h2>What MusicBox hosts</h2>
        <p>MusicBox doesn&apos;t store or stream audio. It stores song information, user-written text, and links to artwork hosted by third parties (such as the Cover Art Archive). Copyright questions therefore usually concern user-written text, a list&apos;s description or an image link.</p>
      </section>

      <section>
        <h2>Reporting infringement</h2>
        <p>If you&apos;re a rights holder (or act for one) and believe something on MusicBox infringes your copyright, email us the following:</p>
        <ul>
          <li>a description of the copyrighted work you say is infringed;</li>
          <li>the exact web address (URL) of the material on MusicBox;</li>
          <li>your name, address, email and phone number;</li>
          <li>a statement that you have a good-faith belief the use isn&apos;t authorised by the rights holder, its agent or the law;</li>
          <li>a statement, under penalty of perjury, that the information is accurate and that you&apos;re authorised to act for the rights holder;</li>
          <li>your physical or electronic signature.</li>
        </ul>
        <p>We review complete notices promptly, remove or disable access to material that appears to infringe, and tell the person who posted it.</p>
      </section>

      <section>
        <h2>If your content was removed</h2>
        <p>If you believe we removed your content by mistake, email us a counter-notice with the URL of what was removed, a statement under penalty of perjury that you believe it was removed by mistake or misidentification, your name and contact details, and your signature. We&apos;ll forward it to the person who reported the content, and may restore the material if they don&apos;t take legal action.</p>
      </section>

      <section>
        <h2>Repeat infringers</h2>
        <p>Accounts that repeatedly infringe copyright are suspended.</p>
      </section>
    </LegalPage>
  );
}
