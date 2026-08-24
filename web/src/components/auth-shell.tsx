import Link from "next/link";
import { FileAudio, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="auth-shell">
    <section className="auth-aside">
      <Link href="/" className="brand brand-light"><span className="brand-mark"><FileAudio size={19} /></span> Class Scribe</Link>
      <div><span className="eyebrow eyebrow-dark"><LockKeyhole size={14} /> Local-first and private</span><h2>Lecture notes,<br />without the busywork.</h2><p>Your computer does the listening. Class Scribe keeps the results ready whenever you need them.</p></div>
      <small>Free stack · Private storage · Local AI</small>
    </section>
    <section className="auth-main"><div className="auth-card">{children}</div></section>
  </main>;
}
