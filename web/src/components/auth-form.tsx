"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot" | "reset";
const content = {
  login: { title: "Welcome back", subtitle: "Sign in to your recordings and study notes.", button: "Sign in" },
  signup: { title: "Create your account", subtitle: "Sign up and start uploading right away.", button: "Create account" },
  forgot: { title: "Reset your password", subtitle: "We’ll send a secure reset link to your email.", button: "Send reset link" },
  reset: { title: "Choose a new password", subtitle: "Use at least eight characters.", button: "Update password" },
} satisfies Record<Mode, { title: string; subtitle: string; button: string }>;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showPassword = mode !== "forgot";
  const showEmail = mode !== "reset";

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(null); setMessage(null);
    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push("/dashboard"); router.refresh();
      } else if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (!data.session) {
          throw new Error("Your account was created, but automatic sign-in is unavailable. Try signing in.");
        }
        router.replace("/dashboard"); router.refresh();
      } else if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (authError) throw authError;
        setMessage("If that address has an account, a reset link is on its way.");
      } else {
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage("Password updated. Taking you to your dashboard…");
        setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 800);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally { setLoading(false); }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-heading"><h1>{content[mode].title}</h1><p>{content[mode].subtitle}</p></div>
      {showEmail && <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>}
      {showPassword && <label>{mode === "reset" ? "New password" : "Password"}<input type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {message && <p className="form-message form-success" role="status">{message}</p>}
      <button className="button button-primary button-full" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <>{content[mode].button}<ArrowRight size={16} /></>}</button>
      {mode === "login" && <Link className="auth-minor-link" href="/forgot-password">Forgot your password?</Link>}
      {mode === "login" && <p className="auth-switch">New here? <Link href="/signup">Create an account</Link></p>}
      {mode === "signup" && <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>}
      {(mode === "forgot" || mode === "reset") && <p className="auth-switch"><Link href="/login">Back to sign in</Link></p>}
    </form>
  );
}
