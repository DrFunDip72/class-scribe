import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
export const metadata: Metadata = { title: "Choose a new password" };
export default function ResetPasswordPage() { return <AuthShell><AuthForm mode="reset" /></AuthShell>; }
