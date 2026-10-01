import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";
export default function ForgotPasswordPage() { return <AuthShell><AuthForm mode="forgot" /></AuthShell>; }
