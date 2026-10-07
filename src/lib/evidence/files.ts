export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;

export const EVIDENCE_CATEGORIES = [
  { value: "living_room", label: "Living Room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "furniture", label: "Furniture" },
  { value: "appliances", label: "Appliances" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type EvidenceFileDetails = Pick<File, "name" | "size" | "type">;

export function evidenceFileMimeType(file: EvidenceFileDetails): string | null {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!expectedMime || file.type && file.type !== expectedMime) return null;
  return expectedMime;
}

export function evidenceFileValidationError(file: EvidenceFileDetails): string | null {
  if (file.size < 1) return "This image is empty.";
  if (file.size > MAX_EVIDENCE_FILE_BYTES) return "Images must be 10 MB or smaller.";
  if (!evidenceFileMimeType(file)) return "Choose a JPG, PNG, or WEBP image.";
  return null;
}

export async function verifyEvidenceImageSignature(file: File): Promise<boolean> {
  if (evidenceFileValidationError(file)) return false;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return mimeTypeFromEvidenceSignature(bytes) === evidenceFileMimeType(file);
}

export function mimeTypeFromEvidenceSignature(bytes: Uint8Array): string | null {
  const mime = evidenceMimeFromHeader(bytes);
  return mime;
}

function evidenceMimeFromHeader(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function evidenceExtensionForMime(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    default: return null;
  }
}
