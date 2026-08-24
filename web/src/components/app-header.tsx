"use client";

import Link from "next/link";
import { FileAudio, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return <header className="app-header">
    <Link href="/dashboard" className="brand"><span className="brand-mark"><FileAudio size={18} /></span> Class Scribe</Link>
    <div className="account-area"><span>{email}</span><button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
  </header>;
}
