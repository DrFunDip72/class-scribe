"use client";

import { Archive, ArchiveRestore, Check, CheckCheck, ChevronDown, Copy, Download, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type CopyTarget = "summary" | "transcript" | "all";
type RecordingState = Database["public"]["Tables"]["recording_user_states"]["Row"];
type RecordingStateUpdate = Database["public"]["Tables"]["recording_user_states"]["Update"];

type ResultActionsProps = {
  filename: string;
  jobId: string;
  userId: string;
  initialState: RecordingState | null;
  summaryContent: string;
  transcriptContent: string;
  allContent: string;
};

const COPY_LABELS: Record<CopyTarget, string> = {
  summary: "Summary",
  transcript: "Transcript",
  all: "Everything",
};

function wasCopied(state: RecordingState | null, target: CopyTarget) {
  if (!state) return false;
  if (target === "all") return Boolean(state.everything_copied_at);
  if (target === "summary") return Boolean(state.summary_copied_at || state.everything_copied_at);
  return Boolean(state.transcript_copied_at || state.everything_copied_at);
}

export function ResultActions({ filename, jobId, userId, initialState, summaryContent, transcriptContent, allContent }: ResultActionsProps) {
  const supabase = useMemo(() => createClient(), []);
  const menuId = useId();
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [state, setState] = useState<RecordingState | null>(initialState);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stateMessage, setStateMessage] = useState<string | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    firstOptionRef.current?.focus();
    function handleMenuKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        copyButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(menuPanelRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const firstButton = buttons[0];
      const lastButton = buttons.at(-1);
      if (!firstButton || !lastButton) return;
      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault();
        lastButton.focus();
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault();
        firstButton.focus();
      }
    }
    window.addEventListener("keydown", handleMenuKeys);
    return () => window.removeEventListener("keydown", handleMenuKeys);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    copyButtonRef.current?.focus();
  }

  async function persistState(update: RecordingStateUpdate, successMessage?: string, failureMessage = "Could not save that status. Please try again.") {
    const previous = state;
    const timestamp = new Date().toISOString();
    const optimistic = {
      job_id: jobId,
      user_id: userId,
      summary_copied_at: null,
      transcript_copied_at: null,
      everything_copied_at: null,
      done_at: null,
      archived_at: null,
      created_at: previous?.created_at ?? timestamp,
      updated_at: timestamp,
      ...previous,
      ...update,
    } satisfies RecordingState;

    setSaving(true);
    setStateMessage(null);
    setState(optimistic);
    const { data, error } = await supabase
      .from("recording_user_states")
      .upsert({ job_id: jobId, user_id: userId, ...update }, { onConflict: "job_id" })
      .select()
      .single();
    setSaving(false);

    if (error) {
      setState(previous);
      setStateMessage(failureMessage);
      return false;
    }

    setState(data);
    if (successMessage) setStateMessage(successMessage);
    return true;
  }

  async function copy(target: CopyTarget) {
    const content = target === "summary" ? summaryContent : target === "transcript" ? transcriptContent : allContent;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      setCopied(null);
      setCopyFailed(true);
      return;
    }
    setMenuOpen(false);
    copyButtonRef.current?.focus();
    setCopyFailed(false);
    setCopied(target);
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopied(null), 1800);
    const copiedAt = new Date().toISOString();
    const update: RecordingStateUpdate = target === "summary"
      ? { summary_copied_at: copiedAt }
      : target === "transcript"
        ? { transcript_copied_at: copiedAt }
        : { everything_copied_at: copiedAt };
    await persistState(update, undefined, "Copied to the clipboard, but the copied checkmark could not be saved. Please try again.");
  }

  async function toggleDone() {
    if (state?.done_at) {
      await persistState({ done_at: null, archived_at: null }, "Moved back to To do.");
    } else {
      await persistState({ done_at: new Date().toISOString(), archived_at: null }, "Marked done.");
    }
  }

  async function toggleArchive() {
    if (state?.archived_at) {
      await persistState({ archived_at: null }, "Restored to Done.");
    } else {
      await persistState({ done_at: state?.done_at ?? new Date().toISOString(), archived_at: new Date().toISOString() }, "Archived.");
    }
  }

  function download() {
    const blob = new Blob([allContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename.replace(/\.[^.]+$/, "")}-notes.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="result-action-shell">
    <div className="result-actions">
      <div className={`copy-menu ${menuOpen ? "open" : ""}`}>
        <button ref={copyButtonRef} className="ghost-button copy-menu-trigger" type="button" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen((open) => !open)}>
          {copied ? <Check size={15} /> : copyFailed ? <TriangleAlert size={15} /> : <Copy size={15} />}
          {copied ? `${COPY_LABELS[copied]} copied` : copyFailed ? "Copy failed" : "Copy"}
          <ChevronDown className="copy-chevron" size={14} />
        </button>
        {menuOpen && <>
          <button className="copy-menu-backdrop" type="button" aria-label="Dismiss copy choices" onClick={closeMenu} />
          <div ref={menuPanelRef} className="copy-menu-options" id={menuId} role="dialog" aria-modal="true" aria-labelledby={`${menuId}-title`}>
            <div className="copy-menu-heading"><strong id={`${menuId}-title`}>Copy to clipboard</strong><button type="button" aria-label="Close copy choices" onClick={closeMenu}><X size={18} /></button></div>
            {(Object.keys(COPY_LABELS) as CopyTarget[]).map((target, index) =>
              <button ref={index === 0 ? firstOptionRef : undefined} key={target} type="button" onClick={() => void copy(target)}>
                <span className="copy-option-text">
                  <strong>{COPY_LABELS[target]}</strong>
                  <span>{target === "summary" ? "Summary, key points, and action items" : target === "transcript" ? "The full transcript only" : "Study notes and transcript"}</span>
                </span>
                {wasCopied(state, target) && <Check className="copy-saved-check" size={17} aria-label="Previously copied" />}
              </button>
            )}
          </div>
        </>}
      </div>
      <button className="button button-primary button-small result-download" type="button" onClick={download}><Download size={15} /> Download notes</button>
      <button className={`ghost-button result-state-button ${state?.done_at ? "active" : ""}`} type="button" disabled={saving} onClick={() => void toggleDone()}>
        {state?.done_at ? <RotateCcw size={15} /> : <CheckCheck size={15} />}
        {state?.done_at ? "Mark not done" : "Mark done"}
      </button>
      {state?.done_at && <button className="ghost-button result-state-button" type="button" disabled={saving} onClick={() => void toggleArchive()}>
        {state.archived_at ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        {state.archived_at ? "Restore" : "Archive"}
      </button>}
    </div>
    <span className="sr-only" aria-live="polite">{copied ? `${COPY_LABELS[copied]} copied to clipboard.` : copyFailed ? "Could not copy to the clipboard." : stateMessage ?? ""}</span>
    {stateMessage && <p className="result-state-message" role="status">{stateMessage}</p>}
  </div>;
}
