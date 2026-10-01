"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, KeyRound, LogOut, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/workspace-provider";

export function AccountView() {
  const workspace = useWorkspace();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return <section className="page-section">
    <Link className="back-link" href="/settings"><ArrowLeft size={15} /> Settings</Link>
    <h1 className="page-title">Account</h1>

    <div className="settings-card">
      <div className="settings-row">
        <span className="install-icon"><Mail size={17} /></span>
        <div><strong>Email</strong><small>{workspace.userEmail}</small></div>
      </div>
      <Link className="settings-row settings-row-link" href="/forgot-password">
        <span className="install-icon"><KeyRound size={17} /></span>
        <div><strong>Change password</strong><small>We’ll email you a reset link.</small></div>
      </Link>
    </div>

    <div className="settings-card">
      <div className="card-heading"><div><h2>Your recordings stay private</h2></div></div>
      <div className="settings-row">
        <span className="install-icon"><ShieldCheck size={17} /></span>
        <div><strong>Private by default</strong><small>Recordings upload to private storage and are only ever readable by this account.</small></div>
      </div>
      <div className="settings-row">
        <span className="install-icon"><Trash2 size={17} /></span>
        <div><strong>Audio is deleted</strong><small>Source audio is removed once your notes are ready. The transcript and notes stay in your account.</small></div>
      </div>
    </div>

    <button type="button" className="button button-full button-secondary" disabled={signingOut} onClick={() => void signOut()}>
      <LogOut size={17} /> {signingOut ? "Signing out…" : "Sign out"}
    </button>
  </section>;
}
