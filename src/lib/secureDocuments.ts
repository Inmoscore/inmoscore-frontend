"use client";

export type SecureDocumentCategory =
  | "identity_document"
  | "report_evidence"
  | "dispute_evidence"
  | "human_review_evidence"
  | "contract"
  | "other";

type UploadIntentResponse = {
  success?: boolean;
  message?: string;
  document_id?: string;
  bucket_name?: string;
  storage_path?: string;
  signed_upload?: {
    path?: string;
    token?: string;
    signed_url?: string;
  };
  expires_in_seconds?: number;
};

type ConfirmUploadResponse = {
  success?: boolean;
  message?: string;
  document?: {
    id: string;
    status: string;
  };
};

async function readResponseError(response: Response) {
  const data = await response
    .clone()
    .json()
    .catch(() => null) as { message?: unknown; error?: unknown } | null;
  const message = typeof data?.message === "string" ? data.message : "";
  const error = typeof data?.error === "string" ? data.error : "";

  if (message || error) return message || error;

  return response
    .text()
    .then((text) => text.slice(0, 300))
    .catch(() => "");
}

export async function uploadSecureDocument(params: {
  apiUrl: string;
  token: string;
  file: File;
  category: SecureDocumentCategory;
  relatedEntityType: string;
  relatedEntityId?: string | null;
  sha256Hash?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ documentId: string }> {
  const intentResponse = await fetch(`${params.apiUrl}/api/documents/upload-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      related_entity_type: params.relatedEntityType,
      related_entity_id: params.relatedEntityId || null,
      document_category: params.category,
      original_file_name: params.file.name,
      mime_type: params.file.type || "application/octet-stream",
      file_size: params.file.size,
      sha256_hash: params.sha256Hash || null,
      metadata: params.metadata || {},
    }),
  });

  const intent: UploadIntentResponse = await intentResponse.json().catch(() => ({}));

  if (!intentResponse.ok || !intent.success || !intent.document_id || !intent.signed_upload?.signed_url) {
    console.warn("[SECURE_DOCUMENT_FRONTEND]", {
      step: "upload_intent",
      status: "failed",
      response_status: intentResponse.status,
      response_error: intent.message || "missing_signed_upload",
      document_id: intent.document_id || null,
    });
    throw new Error(intent.message || "No se pudo crear la carga segura del documento.");
  }

  console.warn("[SECURE_DOCUMENT_FRONTEND]", {
    step: "upload_intent",
    status: "success",
    response_status: intentResponse.status,
    response_error: null,
    document_id: intent.document_id,
  });

  const uploadBody = new FormData();
  uploadBody.append("cacheControl", "3600");
  uploadBody.append("", params.file);

  const uploadResponse = await fetch(intent.signed_upload.signed_url, {
    method: "PUT",
    headers: {
      "x-upsert": "false",
    },
    body: uploadBody,
  });

  if (!uploadResponse.ok) {
    console.warn("[SECURE_DOCUMENT_FRONTEND]", {
      step: "upload_to_storage",
      status: "failed",
      response_status: uploadResponse.status,
      response_error: await readResponseError(uploadResponse),
      document_id: intent.document_id,
    });
    throw new Error("No se pudo subir el archivo al storage privado.");
  }

  console.warn("[SECURE_DOCUMENT_FRONTEND]", {
    step: "upload_to_storage",
    status: "success",
    response_status: uploadResponse.status,
    response_error: null,
    document_id: intent.document_id,
  });

  const confirmResponse = await fetch(
    `${params.apiUrl}/api/documents/${intent.document_id}/confirm-upload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.token}`,
      },
    }
  );
  const confirm: ConfirmUploadResponse = await confirmResponse.json().catch(() => ({}));

  if (!confirmResponse.ok || !confirm.success) {
    console.warn("[SECURE_DOCUMENT_FRONTEND]", {
      step: "confirm_upload",
      status: "failed",
      response_status: confirmResponse.status,
      response_error: confirm.message || "confirm_upload_failed",
      document_id: intent.document_id,
    });
    throw new Error(confirm.message || "No se pudo confirmar la carga segura del documento.");
  }

  console.warn("[SECURE_DOCUMENT_FRONTEND]", {
    step: "confirm_upload",
    status: "success",
    response_status: confirmResponse.status,
    response_error: null,
    document_id: intent.document_id,
  });

  return { documentId: intent.document_id };
}
