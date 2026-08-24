const OUTPUT_SAMPLE_RATE = 16_000;
const OUTPUT_BITRATE = 48_000;

export type ExtractionProgress = (progress: number) => void;

function outputName(sourceName: string) {
  const base = sourceName.replace(/\.[^.]+$/, "").trim() || "recording";
  return `${base}_audio.m4a`;
}

function invalidConversionMessage(reasons: string[]) {
  if (reasons.includes("undecodable_source_codec")) {
    return "This browser cannot decode the video's audio track. Try the latest Chrome or Edge.";
  }
  if (reasons.includes("unknown_source_codec")) {
    return "The video's audio codec is not recognized.";
  }
  return "The video audio could not be converted in this browser.";
}

export async function extractAudioForUpload(file: File, onProgress: ExtractionProgress) {
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
      throw new Error("This video format could not be read in the browser.");
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      throw new Error("This video does not contain an audio track.");
    }
    if (!(await audioTrack.canDecode())) {
      throw new Error("This browser cannot decode the video's audio track. Try the latest Chrome or Edge.");
    }

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
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

    conversion.onProgress = (progress) => onProgress(Math.max(0, Math.min(1, progress)));
    onProgress(0);
    await conversion.execute();
    onProgress(1);

    if (!target.buffer?.byteLength) {
      throw new Error("The video produced an empty audio file.");
    }

    return new File([target.buffer], outputName(file.name), {
      type: "audio/mp4",
      lastModified: file.lastModified,
    });
  } finally {
    input.dispose();
  }
}
