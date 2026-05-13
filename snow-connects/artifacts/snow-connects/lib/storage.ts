import { supabase } from "./supabase";

export const INSTRUCTOR_DOCS_BUCKET = "instructor-docs";

// Upload a local file (from expo-image-picker / expo-document-picker URI)
// to the private 'instructor-docs' bucket under '<userId>/<kind>-<ts>.<ext>'.
//
// Storage RLS requires the first folder segment to equal the caller's auth.uid,
// which is exactly what we do here.
export async function uploadInstructorDoc(params: {
  userId: string;
  kind: "cert" | "id-front" | "id-back" | "photo";
  uri: string;
  mimeType?: string | null;
}): Promise<string> {
  const { userId, kind, uri, mimeType } = params;
  const cleanUri = uri.split("?")[0];
  const lastSegment = cleanUri.split("/").pop() ?? "";
  const ext = (lastSegment.includes(".")
    ? lastSegment.split(".").pop()
    : "jpg"
  )!.toLowerCase();
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;

  // React Native's fetch() handles file:// URIs and produces a streamable body.
  const res = await fetch(uri);
  const arrayBuffer = await res.arrayBuffer();

  const { error } = await supabase.storage
    .from(INSTRUCTOR_DOCS_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: mimeType ?? guessMime(ext),
      upsert: true,
    });
  if (error) throw error;
  return path;
}

export async function getSignedDocUrl(
  path: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(INSTRUCTOR_DOCS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

function guessMime(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}
