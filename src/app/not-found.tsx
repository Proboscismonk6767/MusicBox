import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="display text-[120px] leading-none text-faint">404</div>
      <h1 className="display text-3xl mt-2">This track skipped.</h1>
      <p className="text-muted mt-2 mb-8">The page you&apos;re looking for doesn&apos;t exist or is unavailable.</p>
      <div className="flex justify-center gap-2">
        <Link href="/" className="btn-primary">Go home</Link>
        <Link href="/search" className="btn-secondary">Search songs</Link>
      </div>
    </div>
  );
}
