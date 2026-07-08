import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from './supabase';

export const MAX_SECURE_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const SIGNED_UPLOAD_EXPIRES_IN_SECONDS = 300;
export const SIGNED_READ_EXPIRES_IN_SECONDS = 60;

export const SECURE_DOCUMENT_CATEGORIES = [
  'identity_document',
  'report_evidence',
  'dispute_evidence',
  'human_review_evidence',
  'contract',
  'other',
] as const;

export const SECURE_DOCUMENT_STATUSES = [
  'pending_upload',
  'uploaded',
  'ready_for_review',
  'quarantined',
  'rejected',
  'deleted',
] as const;

export const SECURE_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const DOCUMENT_ACCESS_ACTION_TYPES = [
  'upload_intent_created',
  'upload_confirmed',
  'view_requested',
  'download_requested',
  'signed_url_issued',
  'access_denied',
  'deleted',
  'legal_hold_enabled',
  'legal_hold_disabled',
] as const;

export const DOCUMENT_ACCESS_RESULTS = ['allowed', 'denied', 'failed'] as const;

export type SecureDocumentCategory = (typeof SECURE_DOCUMENT_CATEGORIES)[number];
export type SecureDocumentStatus = (typeof SECURE_DOCUMENT_STATUSES)[number];
export type SecureDocumentMimeType = (typeof SECURE_DOCUMENT_MIME_TYPES)[number];
export type DocumentAccessActionType = (typeof DOCUMENT_ACCESS_ACTION_TYPES)[number];
export type DocumentAccessResult = (typeof DOCUMENT_ACCESS_RESULTS)[number];

export type SecureDocumentRow = {
  id: string;
  owner_user_id: string | null;
  related_entity_type: string;
  related_entity_id: string | null;
  document_category: SecureDocumentCategory;
  bucket_name: string;
  storage_path: string;
  original_file_name: string;
  mime_type: SecureDocumentMimeType;
  file_size: number;
  sha256_hash: string | null;
  status: SecureDocumentStatus;
  uploaded_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  retention_until: string | null;
  legal_hold: boolean;
  deleted_at: string | null;
  deletion_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ActorContext = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type CreateDocumentUploadIntentInput = ActorContext & {
  ownerUserId: string;
  relatedEntityType: string;
  relatedEntityId?: string | null;
  documentCategory: SecureDocumentCategory;
  originalFileName: string;
  mimeType: SecureDocumentMimeType;
  fileSize: number;
  sha256Hash?: string | null;
  metadata?: Record<string, unknown>;
};

type ConfirmDocumentUploadInput = ActorContext & {
  documentId: string;
  ownerUserId?: string | null;
  allowAdmin?: boolean;
  sha256Hash?: string | null;
};

type SignedReadUrlInput = ActorContext & {
  documentId: string;
  bucketName: string;
  storagePath: string;
  reason?: string | null;
};

type SignedUploadResult = {
  path: string;
  token: string;
  signedUrl: string;
};

type LogDocumentAccessInput = ActorContext & {
  documentId?: string | null;
  actionType: DocumentAccessActionType;
  accessResult: DocumentAccessResult;
  reason?: string | null;
};

const forbiddenMetadataKeyPattern = /(password|passwd|secret|token|api[_-]?key|authorization|credential)/i;

const secureDocumentMetadataSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .default({})
  .superRefine((metadata, ctx) => {
    if (containsForbiddenMetadataKey(metadata)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'metadata no puede contener secretos, tokens o credenciales',
      });
    }
  });

export const secureDocumentUploadIntentSchema = z
  .object({
    related_entity_type: z
      .string()
      .trim()
      .min(2, 'related_entity_type es requerido')
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/, 'related_entity_type debe usar snake_case'),
    related_entity_id: z.string().uuid('related_entity_id invalido').optional().nullable(),
    document_category: z.enum(SECURE_DOCUMENT_CATEGORIES),
    original_file_name: z.string().trim().min(1).max(240),
    mime_type: z.enum(SECURE_DOCUMENT_MIME_TYPES),
    file_size: z.number().int().positive().max(MAX_SECURE_DOCUMENT_SIZE_BYTES),
    sha256_hash: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/, 'sha256_hash debe tener 64 caracteres hexadecimales')
      .optional()
      .nullable(),
    metadata: secureDocumentMetadataSchema.optional(),
  })
  .strict();

const SECURE_DOCUMENT_SELECT_COLUMNS = [
  'id',
  'owner_user_id',
  'related_entity_type',
  'related_entity_id',
  'document_category',
  'bucket_name',
  'storage_path',
  'original_file_name',
  'mime_type',
  'file_size',
  'sha256_hash',
  'status',
  'uploaded_at',
  'verified_at',
  'rejected_at',
  'rejection_reason',
  'retention_until',
  'legal_hold',
  'deleted_at',
  'deletion_reason',
  'metadata',
  'created_at',
  'updated_at',
].join(', ');

function containsForbiddenMetadataKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenMetadataKey(item));
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, nestedValue]) =>
      forbiddenMetadataKeyPattern.test(key) || containsForbiddenMetadataKey(nestedValue)
  );
}

function normalizeFileName(fileName: string): string {
  return fileName.trim().replace(/[^\w.\-()\s]/g, '_').slice(0, 240);
}

function buildStoragePath(input: {
  ownerUserId: string;
  documentCategory: SecureDocumentCategory;
  originalFileName: string;
}): string {
  const safeFileName = normalizeFileName(input.originalFileName) || 'document';
  const randomSegment = crypto.randomBytes(24).toString('hex');
  const uploadId = crypto.randomUUID();
  const extensionMatch = safeFileName.match(/\.[A-Za-z0-9]{1,12}$/);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : '';

  return [
    'users',
    input.ownerUserId,
    input.documentCategory,
    `${uploadId}-${randomSegment}${extension}`,
  ].join('/');
}

export function validateDocumentMetadata(metadata: unknown): Record<string, unknown> {
  const parsed = secureDocumentMetadataSchema.parse(metadata ?? {});
  return parsed;
}

export function resolveBucketByCategory(category: SecureDocumentCategory): string {
  switch (category) {
    case 'identity_document':
      return 'identity-documents';
    case 'report_evidence':
      return 'report-evidence';
    case 'dispute_evidence':
      return 'legal-dispute-evidence';
    case 'human_review_evidence':
      return 'human-review-documents';
    case 'contract':
    case 'other':
      return 'report-evidence';
  }
}

export async function logDocumentAccess(input: LogDocumentAccessInput): Promise<void> {
  const { error } = await supabase.from('document_access_logs').insert({
    document_id: input.documentId || null,
    actor_user_id: input.actorUserId || null,
    actor_email: input.actorEmail || null,
    actor_role: input.actorRole || null,
    action_type: input.actionType,
    access_result: input.accessResult,
    reason: input.reason || null,
    ip_address: input.ipAddress || null,
    user_agent: input.userAgent || null,
  });

  if (error) {
    throw error;
  }
}

export async function createDocumentUploadIntent(
  input: CreateDocumentUploadIntentInput
): Promise<SecureDocumentRow> {
  const metadata = validateDocumentMetadata(input.metadata ?? {});
  const bucketName = resolveBucketByCategory(input.documentCategory);
  const storagePath = buildStoragePath({
    ownerUserId: input.ownerUserId,
    documentCategory: input.documentCategory,
    originalFileName: input.originalFileName,
  });

  const { data, error } = await supabase
    .from('secure_documents' as any)
    .insert({
      owner_user_id: input.ownerUserId,
      related_entity_type: input.relatedEntityType,
      related_entity_id: input.relatedEntityId || null,
      document_category: input.documentCategory,
      bucket_name: bucketName,
      storage_path: storagePath,
      original_file_name: input.originalFileName.trim(),
      mime_type: input.mimeType,
      file_size: input.fileSize,
      sha256_hash: input.sha256Hash || null,
      status: 'pending_upload',
      metadata,
    })
    .select(SECURE_DOCUMENT_SELECT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  const document = data as unknown as SecureDocumentRow;

  await logDocumentAccess({
    documentId: document.id,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    actionType: 'upload_intent_created',
    accessResult: 'allowed',
    reason: 'signed_private_storage_upload_intent',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return document;
}

export async function createSignedUpload(
  documentId: string,
  bucketName: string,
  storagePath: string
): Promise<SignedUploadResult> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw error || new Error('No se pudo crear signed upload URL');
  }

  return {
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

export async function verifyObjectExists(
  bucketName: string,
  storagePath: string
): Promise<boolean> {
  const bucket = supabase.storage.from(bucketName);
  const exists = await bucket.exists(storagePath);

  if (!exists.error) {
    return Boolean(exists.data);
  }

  const info = await bucket.info(storagePath);
  if (info.error) {
    return false;
  }

  return Boolean(info.data);
}

export async function confirmDocumentUpload(
  input: ConfirmDocumentUploadInput
): Promise<SecureDocumentRow | null> {
  let query = supabase
    .from('secure_documents' as any)
    .update({
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
      sha256_hash: input.sha256Hash || undefined,
    })
    .eq('id', input.documentId)
    .eq('status', 'pending_upload');

  if (!input.allowAdmin) {
    query = query.eq('owner_user_id', input.ownerUserId || '');
  }

  const { data, error } = await query.select(SECURE_DOCUMENT_SELECT_COLUMNS).maybeSingle();

  if (error) {
    throw error;
  }

  const document = data as unknown as SecureDocumentRow | null;

  if (document) {
    await logDocumentAccess({
      documentId: document.id,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      actorRole: input.actorRole,
      actionType: 'upload_confirmed',
      accessResult: 'allowed',
      reason: 'metadata_upload_confirmed',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  return document;
}

export async function createSignedReadUrl(
  input: SignedReadUrlInput
): Promise<{ signedUrl: string; expiresInSeconds: number }> {
  const { data, error } = await supabase.storage
    .from(input.bucketName)
    .createSignedUrl(input.storagePath, SIGNED_READ_EXPIRES_IN_SECONDS);

  if (error || !data?.signedUrl) {
    throw error || new Error('No se pudo crear signed read URL');
  }

  await logDocumentAccess({
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    actionType: 'signed_url_issued',
    accessResult: 'allowed',
    reason: input.reason || 'private_storage_signed_read_url',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return {
    signedUrl: data.signedUrl,
    expiresInSeconds: SIGNED_READ_EXPIRES_IN_SECONDS,
  };
}
