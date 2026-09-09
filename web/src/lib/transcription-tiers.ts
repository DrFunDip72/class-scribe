export type TranscriptionTier = "fast" | "balanced" | "high";

export const TRANSCRIPTION_TIERS: ReadonlyArray<{
  value: TranscriptionTier;
  label: string;
  model: string;
  estimate: string;
  description: string;
}> = [
  {
    value: "fast",
    label: "Fast",
    model: "small",
    estimate: "About 10 min per hour",
    description: "Quickest turnaround for everyday notes.",
  },
  {
    value: "balanced",
    label: "Balanced",
    model: "distil-large-v3",
    estimate: "About 20 min per hour",
    description: "Better wording without the full High wait.",
  },
  {
    value: "high",
    label: "High",
    model: "medium.en",
    estimate: "About 55 min per hour",
    description: "Best tested exactness for English classes.",
  },
];

export function getTranscriptionTier(value: string | null | undefined) {
  return TRANSCRIPTION_TIERS.find((tier) => tier.value === value) ?? TRANSCRIPTION_TIERS[0];
}
