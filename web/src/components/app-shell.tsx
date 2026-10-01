"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser, FileAudio, ListChecks, Mic, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { courseName } from "@/lib/courses";
import { useClassRecorder } from "@/components/recorder-provider";
import { useWorkspace } from "@/components/workspace-provider";

const TABS = [
  { href: "/record", label: "Record", icon: Mic },
  { href: "/recordings", label: "Notes", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The recording stays visible from every tab so it can never be lost. */
function RecordingBar() {
  const recorder = useClassRecorder();
  const pathname = usePathname();
  if (recorder.status !== "recording" || pathname === "/record") return null;
  return <Link className="recording-bar" href="/record">
    <span className="recorder-dot" aria-hidden="true" />
    <span className="recording-bar-text">
      Recording {recorder.activeCourse ? courseName(recorder.activeCourse) : "class"}
    </span>
    <strong>{formatElapsed(recorder.elapsedMs)}</strong>
  </Link>;
}

function UploadBar() {
  const workspace = useWorkspace();
  const recorder = useClassRecorder();
  if (workspace.uploadState === "idle" || recorder.status === "recording") return null;
  const preparing = workspace.uploadState === "preparing";
  const progress = preparing ? workspace.preparationProgress : workspace.uploadProgress;
  return <div className="upload-bar" role="status">
    <div className="upload-bar-text">
      <span>{preparing ? "Preparing" : "Uploading"} {workspace.preparationIndex} of {workspace.batchCount}</span>
      <strong>{Math.round(progress * 100)}%</strong>
    </div>
    <div className="progress-track slim"><span style={{ width: `${progress * 100}%` }} /></div>
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const workspace = useWorkspace();

  return <div className="app-frame">
    <header className="app-header">
      <Link href="/record" className="brand">
        <span className="brand-mark"><FileAudio size={18} /></span> Class Scribe
      </Link>
      <Link
        href="/account"
        className={`icon-button ${pathname === "/account" ? "active" : ""}`}
        aria-label="Account"
        title={workspace.userEmail}
      >
        <CircleUser size={19} />
      </Link>
    </header>

    <RecordingBar />
    <UploadBar />

    <main className="app-main">{children}</main>

    <nav className="tab-bar" aria-label="Primary">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return <Link
          key={tab.href}
          href={tab.href}
          className={active ? "active" : ""}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={21} />
          <span>{tab.label}</span>
        </Link>;
      })}
    </nav>
  </div>;
}
