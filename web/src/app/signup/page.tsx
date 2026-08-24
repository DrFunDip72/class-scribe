import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
export const metadata: Metadata = { title: "Create account" };
export default function SignupPage() { return <AuthShell><AuthForm mode="signup" /></AuthShell>; }
