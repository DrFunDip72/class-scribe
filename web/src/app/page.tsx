import Link from "next/link";
import { ArrowRight, FileAudio, ListChecks, LockKeyhole, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="landing-shell">
      <nav className="nav-wrap">
        <Link href="/" className="brand">
          <span className="brand-mark"><FileAudio size={19} /></span> Class Scribe
        </Link>
        <div className="nav-actions">
          {user ? (
            <Link className="button button-primary button-small" href="/dashboard">
              Open dashboard <ArrowRight size={15} />
            </Link>
          ) : (
            <><Link className="text-link" href="/login">Sign in</Link>
              <Link className="button button-primary button-small" href="/signup">Create account</Link></>
          )}
        </div>
      </nav>
      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> Your private study assistant</div>
        <h1>Turn every lecture into<br /><span>notes you can use.</span></h1>
        <p className="hero-copy">Upload up to 20 audio or video class recordings at once. Large recordings become compact, upload-safe audio on your device, then your own computer transcribes and summarizes each one.</p>
        <div className="hero-actions">
          <Link className="button button-primary" href={user ? "/dashboard" : "/signup"}>
            {user ? "Open your dashboard" : "Start transcribing free"} <ArrowRight size={17} />
          </Link>
          <span className="cost-note">$0 stack · no per-minute fees</span>
        </div>
        <div className="workflow-card">
          <div className="workflow-head"><span>Monday lectures</span><span className="status-pill status-active"><span /> Local worker online</span></div>
          <div className="mock-job"><div className="file-icon"><FileAudio size={20} /></div><div><strong>Biology_lecture_08.m4a</strong><small>48:12 · Summary and 8 key points ready</small></div><span className="mock-done">Complete</span></div>
          <div className="mock-job"><div className="file-icon purple"><FileAudio size={20} /></div><div className="grow"><strong>Modern_History_week_4.mp3</strong><small>Transcribing on your computer</small><div className="progress-track"><span style={{ width: "62%" }} /></div></div><span className="percent">62%</span></div>
          <div className="mock-job muted"><div className="file-icon"><FileAudio size={20} /></div><div><strong>Statistics_review.wav</strong><small>Next in queue</small></div><span className="status-pill">Queued</span></div>
        </div>
      </section>
      <section className="feature-grid">
        <article><LockKeyhole /><h2>Private by design</h2><p>Original videos and oversized audio never upload. Compact audio parts live in private storage, are removed after processing, and are transcribed on your Windows computer.</p></article>
        <article><ListChecks /><h2>Study-ready results</h2><p>Get a full transcript, concise summary, key points, and action items for every recording.</p></article>
        <article><Sparkles /><h2>Built for class days</h2><p>Send up to 20 recordings together. Videos prepare locally and the worker processes the queue sequentially.</p></article>
      </section>
    </main>
  );
}
