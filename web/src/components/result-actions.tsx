"use client";

import { Check, ChevronDown, Copy, Download, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

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
  const menuId = useId();
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

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

  async function copy(target: CopyTarget) {
    const content = target === "summary" ? summaryContent : target === "transcript" ? transcriptContent : allContent;
    try {
      await navigator.clipboard.writeText(content);
      setMenuOpen(false);
      copyButtonRef.current?.focus();
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
            <strong>{COPY_LABELS[target]}</strong>
            <span>{target === "summary" ? "Summary, key points, and action items" : target === "transcript" ? "The full transcript only" : "Study notes and transcript"}</span>
          </button>
          )}
        </div>
      </>}
    </div>
    <span className="sr-only" aria-live="polite">{copied ? `${COPY_LABELS[copied]} copied to clipboard.` : copyFailed ? "Could not copy to the clipboard." : ""}</span>
    <button className="button button-primary button-small result-download" onClick={download}><Download size={15} /> Download notes</button>
  </div>;
}
