import type { Metadata } from "next";
import { RecordView } from "@/components/record-view";

export const metadata: Metadata = { title: "Record" };
export default function RecordPage() { return <RecordView />; }
