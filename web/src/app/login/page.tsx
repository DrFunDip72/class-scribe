import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() { return <AuthShell><AuthForm mode="login" /></AuthShell>; }
