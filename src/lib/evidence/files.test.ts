import { describe, expect, it } from "vitest";
import {
  evidenceExtensionForMime,
  evidenceFileMimeType,
  evidenceFileValidationError,
  mimeTypeFromEvidenceSignature,
  verifyEvidenceImageSignature,
} from "./files";

describe("evidence image validation", () => {
  it("accepts supported image extensions and maps them to storage MIME types", () => {
    expect(evidenceFileMimeType({ name: "room.jpeg", size: 100, type: "image/jpeg" })).toBe("image/jpeg");
    expect(evidenceFileMimeType({ name: "room.webp", size: 100, type: "image/webp" })).toBe("image/webp");
    expect(evidenceExtensionForMime("image/png")).toBe("png");
  });

  it("rejects unsupported extensions, inconsistent MIME, and oversized files", () => {
    expect(evidenceFileValidationError({ name: "clip.mp4", size: 10, type: "video/mp4" })).toContain("JPG, PNG, or WEBP");
    expect(evidenceFileValidationError({ name: "image.png", size: 10, type: "image/jpeg" })).toContain("JPG, PNG, or WEBP");
    expect(evidenceFileValidationError({ name: "large.jpg", size: 10 * 1024 * 1024 + 1, type: "image/jpeg" })).toContain("10 MB");
  });

  it("checks the image signature rather than trusting the filename or MIME header", async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "condition.jpg", { type: "image/jpeg" });
    const renamedText = new File(["not an image"], "condition.jpg", { type: "image/jpeg" });
    expect(mimeTypeFromEvidenceSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(await verifyEvidenceImageSignature(jpeg)).toBe(true);
    expect(await verifyEvidenceImageSignature(renamedText)).toBe(false);
  });
});
