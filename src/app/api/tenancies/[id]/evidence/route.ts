import { NextResponse } from "next/server";
import {
  EVIDENCE_CATEGORIES,
  MAX_EVIDENCE_FILE_BYTES,
  evidenceFileMimeType,
  mimeTypeFromEvidenceSignature,
} from "@/lib/evidence/files";
import { authorizeEvidenceRequest } from "@/lib/tenancy/evidence-route.server";

const BUCKET = "tenancy-evidence";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TENANCY_ID = new RegExp(`^${UUID}$`, "i");
const CATEGORY = new Set<string>(EVIDENCE_CATEGORIES.map((entry) => entry.value));
const CONTEXTS = new Set(["move_in", "move_out", "deduction", "dispute"]);

type UploadMetadata = {
  storagePath?: unknown;
  evidenceContext?: unknown;
  category?: unknown;
  caption?: unknown;
  deductionId?: unknown;
};

function statusAllowsUpload(status: string, context: string): boolean {
  if (["draft", "awaiting_tenant", "closed", "cancelled"].includes(status)) return false;
  if (context === "move_in") return ["awaiting_deposit", "protected"].includes(status);
  if (context === "move_out") return ["protected", "move_out_review", "deduction_proposed", "settlement_pending", "disputed"].includes(status);
  if (context === "deduction") return ["move_out_review", "deduction_proposed", "settlement_pending"].includes(status);
  if (context === "dispute") return ["move_out_review", "deduction_proposed", "settlement_pending", "disputed"].includes(status);
  return false;
}

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!TENANCY_ID.test(id)) return error(400, "This tenancy link is not valid.");
  const authorization = await authorizeEvidenceRequest(request, id);
  if (!authorization.ok) return error(authorization.status, authorization.message);
  const { context } = authorization;

  let body: UploadMetadata;
  try {
    body = (await request.json()) as UploadMetadata;
  } catch {
    return error(400, "The upload details could not be read.");
  }
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const evidenceContext = typeof body.evidenceContext === "string" ? body.evidenceContext : "";
  const category = typeof body.category === "string" ? body.category : "";
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const deductionId = typeof body.deductionId === "string" ? body.deductionId : null;

  const pathPattern = new RegExp(`^tenancies/${id}/(${[...CONTEXTS].join("|")})/${UUID}\\.(jpg|jpeg|png|webp)$`, "i");
  if (!CONTEXTS.has(evidenceContext) || !pathPattern.test(storagePath) || storagePath.split("/")[2] !== evidenceContext) {
    return error(400, "The evidence path is invalid.");
  }
  if (!statusAllowsUpload(context.status, evidenceContext)) {
    return error(409, "Evidence cannot be added at this stage of the tenancy.");
  }
  if (evidenceContext === "dispute" && context.role !== "tenant") {
    return error(403, "Only the tenant may attach evidence to a challenge.");
  }
  if (evidenceContext === "deduction" && context.role !== "landlord") {
    return error(403, "Only the landlord may add deduction evidence.");
  }
  if (!CATEGORY.has(category) || caption.length < 1 || caption.length > 500) {
    return error(400, "Add a valid category and a caption under 500 characters.");
  }

  const pathParts = storagePath.split("/");
  const filename = pathParts[3] ?? "";
  const expectedMime = evidenceFileMimeType({ name: filename, type: "", size: 1 });
  if (!expectedMime) return error(400, "Choose a JPG, PNG, or WEBP image.");

  if (deductionId) {
    if (!TENANCY_ID.test(deductionId)) return error(400, "The deduction reference is invalid.");
    const { data: deduction, error: deductionError } = await context.service
      .from("deductions")
      .select("id,status")
      .eq("id", deductionId)
      .eq("tenancy_id", id)
      .maybeSingle();
    if (deductionError || !deduction) return error(404, "That deduction is not part of this tenancy.");
    if (evidenceContext === "dispute" && !["proposed", "challenged"].includes(deduction.status)) {
      return error(409, "Evidence cannot be attached to a finalized deduction.");
    }
    if (evidenceContext !== "dispute" && deduction.status !== "proposed") {
      return error(409, "Evidence cannot be attached to a finalized deduction.");
    }
  }

  const { data: existing, error: existingError } = await context.service
    .from("evidence")
    .select("id,uploaded_by_profile_id,file_url")
    .eq("tenancy_id", id)
    .eq("file_url", storagePath)
    .maybeSingle();
  if (existingError) return error(500, "Could not verify the uploaded evidence.");
  if (existing) {
    if (existing.uploaded_by_profile_id !== context.userId) return error(409, "This file is already part of the tenancy record.");
    return NextResponse.json({ evidence: existing, alreadyRecorded: true });
  }

  const { data: owned, error: ownerError } = await context.service.rpc("evidence_storage_owner_matches", {
    p_name: storagePath,
    p_profile_id: context.userId,
  });
  if (ownerError || !owned) return error(403, "Upload the image to this tenancy before recording it.");

  const { data: download, error: downloadError } = await context.service.storage
    .from(BUCKET)
    .download(storagePath);
  if (downloadError || !download) return error(400, "The uploaded image could not be verified.");
  if (download.size < 1 || download.size > MAX_EVIDENCE_FILE_BYTES) {
    await context.service.storage.from(BUCKET).remove([storagePath]);
    return error(413, "Images must be 10 MB or smaller.");
  }
  const header = new Uint8Array(await download.slice(0, 12).arrayBuffer());
  const actualMime = mimeTypeFromEvidenceSignature(header);
  if (!actualMime || actualMime !== expectedMime) {
    await context.service.storage.from(BUCKET).remove([storagePath]);
    return error(415, "The image contents do not match a supported JPG, PNG, or WEBP file.");
  }

  const { data: evidence, error: insertError } = await context.service
    .from("evidence")
    .insert({
      tenancy_id: id,
      uploaded_by_profile_id: context.userId,
      evidence_context: evidenceContext,
      deduction_id: deductionId,
      category,
      file_url: storagePath,
      mime_type: actualMime,
      file_size_bytes: download.size,
      caption,
    })
    .select("id,tenancy_id,uploaded_by_profile_id,evidence_context,deduction_id,category,file_url,mime_type,file_size_bytes,caption,created_at")
    .single();

  if (insertError || !evidence) {
    const { data: raced } = await context.service
      .from("evidence")
      .select("id,uploaded_by_profile_id,file_url")
      .eq("tenancy_id", id)
      .eq("file_url", storagePath)
      .maybeSingle();
    if (raced?.uploaded_by_profile_id === context.userId) {
      return NextResponse.json({ evidence: raced, alreadyRecorded: true });
    }
    await context.service.storage.from(BUCKET).remove([storagePath]);
    return error(500, "The image was uploaded but could not be added to the tenancy record. Please retry.");
  }

  return NextResponse.json({ evidence }, { status: 201 });
}
