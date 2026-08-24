import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { DashboardClient } from "@/components/dashboard-client";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <main className="app-shell"><AppHeader email={user.email ?? "Account"} /><DashboardClient userId={user.id} userEmail={user.email ?? ""} /></main>;
}
