"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

export function ResultActions({ filename, content }: { filename: string; content: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  function download() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${filename.replace(/\.[^.]+$/, "")}-notes.md`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="result-actions"><button className="ghost-button" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy all"}</button><button className="button button-primary button-small" onClick={download}><Download size={15} /> Download notes</button></div>;
}
