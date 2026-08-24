import Link from "next/link";
export default function NotFound() { return <main className="not-found"><span>404</span><h1>That recording isn’t here.</h1><p>It may have been removed, or it belongs to another account.</p><Link className="button button-primary" href="/dashboard">Back to dashboard</Link></main>; }
