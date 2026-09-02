import type { SupabaseClient } from "@supabase/supabase-js";
import { Upload } from "tus-js-client";
import type { Database } from "@/lib/database.types";

const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

type UploadRecordingPartOptions = {
  supabase: SupabaseClient<Database>;
  path: string;
  file: File;
  contentType: string;
  onProgress?: (progress: number) => void;
};

function resumableEndpoint() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Supabase upload configuration is missing.");

  const url = new URL(supabaseUrl);
  const suffix = ".supabase.co";
  if (url.hostname.endsWith(suffix)) {
    const projectRef = url.hostname.slice(0, -suffix.length);
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}

async function uploadResumably({
  supabase,
  path,
  file,
  contentType,
  onProgress,
}: UploadRecordingPartOptions) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Your sign-in expired. Sign in again before uploading.");
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_BYTES,
      metadata: {
        bucketName: "recordings",
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(total > 0 ? uploaded / total : 0),
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch(reject);
  });
}

export async function uploadRecordingPart(options: UploadRecordingPartOptions) {
  options.onProgress?.(0);
  if (options.file.size > RESUMABLE_THRESHOLD_BYTES) {
    await uploadResumably(options);
  } else {
    const { error } = await options.supabase.storage.from("recordings").upload(options.path, options.file, {
      contentType: options.contentType,
      upsert: false,
    });
    if (error) throw error;
  }
  options.onProgress?.(1);
}
