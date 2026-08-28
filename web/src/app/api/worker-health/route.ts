import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
};

export async function GET() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const { data: online, error } = await supabase.rpc("worker_is_online");

  if (error) {
    return new Response(JSON.stringify({ status: "unknown" }), {
      status: 503,
      headers: responseHeaders,
    });
  }

  return new Response(JSON.stringify({ status: online ? "online" : "offline" }), {
    status: online ? 200 : 503,
    headers: responseHeaders,
  });
}
