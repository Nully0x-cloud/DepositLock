"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TENANCY_EVIDENCE_BUCKET } from "@/lib/db/evidence";
import {
  EVIDENCE_CATEGORIES,
  evidenceExtensionForMime,
  evidenceFileMimeType,
  evidenceFileValidationError,
  verifyEvidenceImageSignature,
} from "@/lib/evidence/files";

type UploadContext = "move_in" | "move_out" | "deduction" | "dispute";

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  category: string;
  caption: string;
};

type EvidenceUploaderProps = {
  tenancyId: string;
  context: UploadContext;
  role: "landlord" | "tenant";
  deductionId?: string | null;
  onUploaded(): void;
};

const CONTEXT_LABEL: Record<UploadContext, string> = {
  move_in: "move-in condition",
  move_out: "move-out condition",
  deduction: "deduction",
  dispute: "dispute",
};

export function EvidenceUploader({
  tenancyId,
  context,
  role,
  deductionId = null,
  onUploaded,
}: EvidenceUploaderProps) {
  const inputId = useId();
  const objectUrls = useRef(new Set<string>());
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }, []);

  async function chooseFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    setNotice(null);
    const additions: SelectedImage[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      const validationError = evidenceFileValidationError(file);
      if (validationError || !(await verifyEvidenceImageSignature(file))) {
        rejected.push(`${file.name}: ${validationError ?? "The file contents are not a supported image."}`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.add(previewUrl);
      additions.push({
        id: crypto.randomUUID(),
        file,
        previewUrl,
        category: "general",
        caption: "",
      });
    }
    if (rejected.length) setError(rejected.join(" "));
    if (additions.length) setImages((current) => [...current, ...additions]);
  }

  function updateImage(id: string, patch: Partial<Pick<SelectedImage, "category" | "caption">>) {
    setImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image));
  }

  function removeImage(id: string) {
    const image = images.find((entry) => entry.id === id);
    if (image) {
      URL.revokeObjectURL(image.previewUrl);
      objectUrls.current.delete(image.previewUrl);
    }
    setImages((current) => current.filter((entry) => entry.id !== id));
  }

  async function uploadImages() {
    if (busy || images.length === 0) return;
    const incomplete = images.find((image) => !image.caption.trim());
    if (incomplete) {
      setError(`Add a short caption for ${incomplete.file.name}.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { getSupabaseBrowserClient } = await import("@/lib/db/client");
      const client = getSupabaseBrowserClient();
      if (!client) {
        setError("Evidence storage is unavailable. Refresh the page and try again.");
        return;
      }
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionError || !token) {
        setError("Your sign-in has expired. Sign in again before uploading evidence.");
        return;
      }

      const remaining: SelectedImage[] = [];
      let uploaded = 0;
      for (const image of images) {
        const mimeType = evidenceFileMimeType(image.file);
        const extension = mimeType ? evidenceExtensionForMime(mimeType) : null;
        if (!extension || !mimeType) {
          remaining.push(image);
          setError(`${image.file.name}: choose a JPG, PNG, or WEBP image.`);
          continue;
        }

        const storagePath = `tenancies/${tenancyId}/${context}/${crypto.randomUUID()}.${extension}`;
        const storageResult = await client.storage
          .from(TENANCY_EVIDENCE_BUCKET)
          .upload(storagePath, image.file, { contentType: mimeType, upsert: false });
        if (storageResult.error) {
          remaining.push(image);
          setError("Could not upload the image. Check your connection and retry.");
          continue;
        }

        let response: Response;
        try {
          response = await fetch(`/api/tenancies/${encodeURIComponent(tenancyId)}/evidence`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              storagePath,
              evidenceContext: context,
              category: image.category,
              caption: image.caption.trim(),
              ...(deductionId ? { deductionId } : {}),
            }),
          });
        } catch {
          const { data: recorded } = await client
            .from("evidence")
            .select("id")
            .eq("tenancy_id", tenancyId)
            .eq("file_url", storagePath)
            .maybeSingle();
          if (recorded) {
            uploaded += 1;
            URL.revokeObjectURL(image.previewUrl);
            objectUrls.current.delete(image.previewUrl);
            continue;
          }
          await client.storage.from(TENANCY_EVIDENCE_BUCKET).remove([storagePath]);
          remaining.push(image);
          setError("The image uploaded, but DepositLock could not confirm its record. Refresh before retrying.");
          continue;
        }

        if (!response.ok) {
          const { error: message } = await response.json().catch(() => ({ error: null }));
          await client.storage.from(TENANCY_EVIDENCE_BUCKET).remove([storagePath]);
          remaining.push(image);
          setError(typeof message === "string" ? message : "The image could not be added to this tenancy.");
          continue;
        }

        uploaded += 1;
        URL.revokeObjectURL(image.previewUrl);
        objectUrls.current.delete(image.previewUrl);
      }

      setImages(remaining);
      if (uploaded > 0) {
        setNotice(`${uploaded} ${uploaded === 1 ? "image" : "images"} added to the tenancy record.`);
        onUploaded();
      }
    } catch {
      setError("Evidence storage is temporarily unavailable. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Upload ${CONTEXT_LABEL[context]} evidence`} className="mt-4 rounded-2xl border border-line-soft bg-cream-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Add {CONTEXT_LABEL[context]} photos</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            JPG, PNG, or WEBP · up to 10 MB each · visible to both tenancy participants.
          </p>
        </div>
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-forest/35 px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-forest/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-forest"
        >
          <ImagePlus aria-hidden className="size-4" />
          Choose photos
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              void chooseFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {images.length > 0 ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image) => (
            <li key={image.id} className="overflow-hidden rounded-xl border border-line bg-parchment">
              <div className="relative aspect-[4/3] bg-sand">
                {/* Local previews avoid uploading private files through Next's image cache. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.previewUrl} alt={`Preview of ${image.file.name}`} className="size-full object-contain" />
                <button
                  type="button"
                  onClick={() => removeImage(image.id)}
                  disabled={busy}
                  aria-label={`Remove ${image.file.name} before upload`}
                  className="absolute right-2 top-2 grid size-10 place-items-center rounded-full border border-line bg-parchment text-ink shadow-sm hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <div className="space-y-3 p-3">
                <p className="truncate text-xs text-muted">{image.file.name}</p>
                <label className="block text-xs font-semibold text-ink">
                  Category
                  <select
                    value={image.category}
                    onChange={(event) => updateImage(image.id, { category: event.target.value })}
                    disabled={busy}
                    className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-2.5 text-sm font-normal"
                  >
                    {EVIDENCE_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-ink">
                  Caption
                  <input
                    required
                    maxLength={500}
                    value={image.caption}
                    onChange={(event) => updateImage(image.id, { caption: event.target.value })}
                    disabled={busy}
                    placeholder="What should the other party notice?"
                    className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-2.5 text-sm font-normal"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-dispute">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-protected">
          <Check aria-hidden className="size-4" />{notice}
        </p>
      ) : null}
      {images.length > 0 ? (
        <Button type="button" className="mt-4 min-h-11" onClick={() => void uploadImages()} disabled={busy}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImagePlus aria-hidden className="size-4" />}
          {busy ? "Uploading photos…" : `Add ${images.length} ${images.length === 1 ? "photo" : "photos"}`}
        </Button>
      ) : null}
      <p className="sr-only">Uploaded by the {role}.</p>
    </section>
  );
}
