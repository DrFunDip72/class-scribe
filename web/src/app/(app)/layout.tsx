import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { RecorderProvider } from "@/components/recorder-provider";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { createClient } from "@/lib/supabase/server";
import { getTranscriptionTier } from "@/lib/transcription-tiers";

/**
 * One authentication check for every signed-in screen, and the home of the
 * recorder. Layouts survive route changes, so navigating between tabs cannot
 * tear down an in-progress recording.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: preferences } = await supabase
    .from("user_preferences")
    .select("default_transcription_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  return <WorkspaceProvider
    userId={user.id}
    userEmail={user.email ?? ""}
    initialTier={getTranscriptionTier(preferences?.default_transcription_tier ?? "balanced").value}
  >
    <RecorderProvider>
      <AppShell>{children}</AppShell>
    </RecorderProvider>
  </WorkspaceProvider>;
}
