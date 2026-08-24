import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clock3, FileAudio } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ResultActions } from "@/components/result-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lecture notes" };
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: job }, { data: result }] = await Promise.all([
    supabase.from("transcription_jobs").select("*").eq("id", id).maybeSingle(),
    supabase.from("transcription_results").select("*").eq("job_id", id).maybeSingle(),
  ]);
  if (!job) notFound();
  if (!result) {
    return <main className="app-shell"><AppHeader email={user.email ?? "Account"} /><div className="result-shell"><Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Dashboard</Link><div className="processing-card"><Clock3 /><h1>{job.original_filename}</h1><p>{job.stage}</p><div className="progress-track"><span style={{ width: `${job.progress}%` }} /></div><Link className="button button-primary" href={`/jobs/${id}`}>Check again</Link></div></div></main>;
  }
  const notes = `# ${job.original_filename}\n\n## Summary\n\n${result.summary}\n\n## Key points\n\n${result.key_points.map((point) => `- ${point}`).join("\n")}\n\n## Action items\n\n${result.action_items.length ? result.action_items.map((item) => `- [ ] ${item}`).join("\n") : "- None identified"}\n\n## Transcript\n\n${result.transcript}\n`;
  return <main className="app-shell"><AppHeader email={user.email ?? "Account"} /><article className="result-shell">
    <div className="result-topbar"><Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Dashboard</Link><ResultActions filename={job.original_filename} content={notes} /></div>
    <header className="result-header"><span className="result-file-icon"><FileAudio /></span><div><span className="section-kicker">Completed lecture</span><h1>{job.original_filename}</h1><p><CheckCircle2 size={15} /> Processed {job.completed_at ? new Date(job.completed_at).toLocaleString() : "successfully"}{result.detected_language ? ` · ${result.detected_language.toUpperCase()}` : ""}</p></div></header>
    <section className="notes-section summary-section"><span className="section-number">01</span><div><h2>Summary</h2><p className="summary-copy">{result.summary}</p></div></section>
    <div className="notes-columns"><section className="notes-section"><span className="section-number">02</span><div><h2>Key points</h2><ul className="point-list">{result.key_points.map((point, index) => <li key={index}><CheckCircle2 size={17} />{point}</li>)}</ul></div></section><section className="notes-section"><span className="section-number">03</span><div><h2>Action items</h2>{result.action_items.length ? <ul className="point-list action-list">{result.action_items.map((item, index) => <li key={index}><Circle size={16} />{item}</li>)}</ul> : <p className="muted-copy">No action items were identified.</p>}</div></section></div>
    <section className="transcript-section"><div className="transcript-heading"><div><span className="section-number">04</span><h2>Full transcript</h2></div><small>{result.transcript.split(/\s+/).length.toLocaleString()} words</small></div><div className="transcript-copy">{result.transcript.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>
  </article></main>;
}
