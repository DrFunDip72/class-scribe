import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function Offline() {
  return <main className="not-found">
    <span>Offline</span>
    <h1>You’re not connected.</h1>
    <p>Class Scribe needs a connection to show your recordings. Anything already uploaded keeps processing on its own.</p>
    <Link className="button button-primary" href="/record">Try again</Link>
  </main>;
}
