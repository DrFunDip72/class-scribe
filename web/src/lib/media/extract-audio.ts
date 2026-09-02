const OUTPUT_SAMPLE_RATE = 16_000;
const OUTPUT_BITRATE = 48_000;
const MAX_PART_DURATION_SECONDS = 90 * 60;
const MAX_PARTS = 32;
const MAX_STORAGE_OBJECT_BYTES = 50 * 1024 * 1024;

export type ExtractionProgress = (progress: number) => void;

export type PreparedRecordingPart = {
  file: File;
  partIndex: number;
  partCount: number;
};

function outputName(sourceName: string, partIndex: number, partCount: number) {
  const base = sourceName.replace(/\.[^.]+$/, "").trim() || "recording";
  if (partCount === 1) return `${base}_audio.m4a`;
  return `${base}_part_${String(partIndex + 1).padStart(2, "0")}.m4a`;
}

function invalidConversionMessage(reasons: string[]) {
  if (reasons.includes("undecodable_source_codec")) {
    return "This browser cannot decode the recording's audio. Try the latest Chrome or Edge.";
  }
  if (reasons.includes("unknown_source_codec")) {
    return "The recording's audio codec is not recognized.";
  }
  return "The recording could not be converted in this browser.";
}

/**
 * Converts one local audio/video source into upload-safe speech audio.
 * Parts are yielded one at a time so the caller can upload and release each
 * buffer before the next part is encoded.
 */
export async function* extractAudioPartsForUpload(
  file: File,
  onProgress: ExtractionProgress,
  maxPartDurationSeconds = MAX_PART_DURATION_SECONDS,
): AsyncGenerator<PreparedRecordingPart> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
    canEncodeAudio,
  } = await import("mediabunny");

  const quality = new Quality({ bitrate: OUTPUT_BITRATE });
  if (!(await canEncodeAudio("aac", {
    numberOfChannels: 1,
    sampleRate: OUTPUT_SAMPLE_RATE,
    quality,
  }))) {
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    registerAacEncoder();
  }

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 }),
  });

  try {
    if (!(await input.canRead())) {
      throw new Error("This recording format could not be read in this browser.");
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      throw new Error("This recording does not contain an audio track.");
    }
    if (!(await audioTrack.canDecode())) {
      throw new Error("This browser cannot decode the recording's audio. Try the latest Chrome or Edge.");
    }

    const duration = await audioTrack.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("The recording duration could not be determined.");
    }

    const partCount = Math.ceil(duration / maxPartDurationSeconds);
    if (partCount > MAX_PARTS) {
      throw new Error(`This recording is too long to prepare safely. Split it into ${MAX_PARTS} or fewer sections.`);
    }

    for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
      const start = partIndex * maxPartDurationSeconds;
      const end = Math.min(duration, start + maxPartDurationSeconds);
      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat(),
        target,
      });
      const conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        trim: { start, end },
        video: { discard: true },
        audio: {
          codec: "aac",
          numberOfChannels: 1,
          sampleRate: OUTPUT_SAMPLE_RATE,
          quality,
          forceTranscode: true,
        },
        tags: {},
        showWarnings: false,
      });

      if (!conversion.isValid) {
        throw new Error(invalidConversionMessage(conversion.discardedTracks.map(({ reason }) => reason)));
      }

      conversion.onProgress = (progress) => {
        onProgress(Math.max(0, Math.min(1, (partIndex + progress) / partCount)));
      };
      onProgress(partIndex / partCount);
      await conversion.execute();

      if (!target.buffer?.byteLength) {
        throw new Error("The recording produced an empty audio part.");
      }
      if (target.buffer.byteLength > MAX_STORAGE_OBJECT_BYTES) {
        throw new Error("A prepared audio part exceeded 50 MB. Please split the source recording and try again.");
      }

      onProgress((partIndex + 1) / partCount);
      yield {
        file: new File([target.buffer], outputName(file.name, partIndex, partCount), {
          type: "audio/mp4",
          lastModified: file.lastModified,
        }),
        partIndex,
        partCount,
      };
    }
  } finally {
    input.dispose();
  }
}

/** Backward-compatible single-part helper used by older tests and callers. */
export async function extractAudioForUpload(file: File, onProgress: ExtractionProgress) {
  for await (const part of extractAudioPartsForUpload(file, onProgress)) {
    if (part.partCount !== 1) {
      throw new Error("This recording requires multiple upload parts.");
    }
    return part.file;
  }
  throw new Error("The recording produced no audio.");
}
