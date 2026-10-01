import { redirect } from "next/navigation";

/** The installed app and older bookmarks still point at /dashboard. */
export default function DashboardPage() { redirect("/record"); }
