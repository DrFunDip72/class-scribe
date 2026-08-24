"use client";

import { Check, ChevronDown, Copy, Download, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyTarget = "summary" | "transcript" | "all";

type ResultActionsProps = {
  filename: string;
  summaryContent: string;
  transcriptContent: string;
  allContent: string;
};

const COPY_LABELS: Record<CopyTarget, string> = {
  summary: "Summary",
  transcript: "Transcript",
  all: "Everything",
};

export function ResultActions({ filename, summaryContent, transcriptContent, allContent }: ResultActionsProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  async function copy(target: CopyTarget) {
    const content = target === "summary" ? summaryContent : target === "transcript" ? transcriptContent : allContent;
    try {
      await navigator.clipboard.writeText(content);
      menuRef.current?.removeAttribute("open");
      setCopyFailed(false);
      setCopied(target);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  }

  function download() {
    const blob = new Blob([allContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${filename.replace(/\.[^.]+$/, "")}-notes.md`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="result-actions">
    <details className="copy-menu" ref={menuRef}>
      <summary className="ghost-button" aria-label="Choose what to copy">
        {copied ? <Check size={15} /> : copyFailed ? <TriangleAlert size={15} /> : <Copy size={15} />}
        {copied ? `${COPY_LABELS[copied]} copied` : copyFailed ? "Copy failed" : "Copy"}
        <ChevronDown className="copy-chevron" size={14} />
      </summary>
      <div className="copy-menu-options">
        {(Object.keys(COPY_LABELS) as CopyTarget[]).map((target) =>
          <button key={target} type="button" onClick={() => void copy(target)}>
            <strong>{COPY_LABELS[target]}</strong>
            <span>{target === "summary" ? "Summary, key points, and action items" : target === "transcript" ? "The full transcript only" : "Study notes and transcript"}</span>
          </button>
        )}
      </div>
    </details>
    <span className="sr-only" aria-live="polite">{copied ? `${COPY_LABELS[copied]} copied to clipboard.` : copyFailed ? "Could not copy to the clipboard." : ""}</span>
    <button className="button button-primary button-small" onClick={download}><Download size={15} /> Download notes</button>
  </div>;
}
