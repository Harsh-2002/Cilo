import Link from "next/link";
export default function Unavailable() {
  return (
    <main className="publication-unavailable">
      <Link href="/" className="publication-brand">
        Cilo
      </Link>
      <h1>This note is no longer available.</h1>
      <p>The link may have been removed or replaced by its owner.</p>
    </main>
  );
}
