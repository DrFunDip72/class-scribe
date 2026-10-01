"use client";

import Link from "next/link";
import { ArrowRight, CircleUser, GraduationCap } from "lucide-react";
import { InstallCard } from "@/components/install-card";
import { NotificationSettings } from "@/components/notification-settings";
import { useWorkspace } from "@/components/workspace-provider";
import { TRANSCRIPTION_TIERS, type TranscriptionTier } from "@/lib/transcription-tiers";

export function SettingsView() {
  const workspace = useWorkspace();

  return <section className="page-section">
    <h1 className="page-title">Settings</h1>

    <InstallCard />

    <div className="settings-card">
      <div className="card-heading"><div><h2>Transcription quality</h2><p>Used for files you upload. Recorded classes always use High.</p></div></div>
      <fieldset className="transcription-tier-picker">
        <legend className="sr-only">Default transcription quality</legend>
        <div className="tier-options">
          {TRANSCRIPTION_TIERS.map((tier) => <label className={`tier-option ${workspace.defaultTier === tier.value ? "selected" : ""}`} key={tier.value}>
            <input
              type="radio"
              name="default-tier"
              value={tier.value}
              checked={workspace.defaultTier === tier.value}
              onChange={() => void workspace.saveDefaultTier(tier.value as TranscriptionTier)}
            />
            <span className="tier-option-heading"><strong>{tier.label}</strong>{tier.value === "balanced" ? <em>Recommended</em> : null}</span>
            <small>{tier.estimate}</small>
            <span>{tier.description}</span>
          </label>)}
        </div>
        <p>Times are estimates and vary with recording length and sound quality.</p>
      </fieldset>
    </div>

    <NotificationSettings userId={workspace.userId} accountEmail={workspace.userEmail} />

    <Link className="settings-link" href="/classes">
      <span className="install-icon"><GraduationCap size={17} /></span>
      <div><strong>Classes</strong><small>{workspace.classes.length} class{workspace.classes.length === 1 ? "" : "es"}</small></div>
      <ArrowRight size={17} />
    </Link>

    <Link className="settings-link" href="/account">
      <span className="install-icon"><CircleUser size={17} /></span>
      <div><strong>Account</strong><small>{workspace.userEmail}</small></div>
      <ArrowRight size={17} />
    </Link>
  </section>;
}
