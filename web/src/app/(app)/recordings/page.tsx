import type { Metadata } from "next";
import { RecordingsView } from "@/components/recordings-view";

export const metadata: Metadata = { title: "Your notes" };
export default function RecordingsPage() { return <RecordingsView />; }
