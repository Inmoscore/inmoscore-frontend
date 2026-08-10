import { z } from 'zod';

export const DATA_SUBJECT_REQUEST_TYPES = [
  'access',
  'correction',
  'deletion',
  'authorization_revocation',
  'claim',
  'other',
] as const;

export const DATA_SUBJECT_REQUEST_STATUSES = [
  'received',
  'in_review',
  'awaiting_user_info',
  'resolved',
  'rejected',
] as const;

export type DataSubjectRequestType = (typeof DATA_SUBJECT_REQUEST_TYPES)[number];
export type DataSubjectRequestStatus = (typeof DATA_SUBJECT_REQUEST_STATUSES)[number];

export type DataSubjectRequestRow = {
  id: string;
  user_id: string | null;
  requester_email: string;
  requester_name: string | null;
  requester_document_id: string | null;
  request_type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  description: string;
  admin_notes: string | null;
  submitted_at: string;
  due_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

export const dataSubjectRequestCreateSchema = z.object({
  requester_email: z.string().trim().email('Email invalido').max(180),
  requester_name: z.string().trim().max(150).optional().nullable(),
  requester_document_id: z.string().trim().max(80).optional().nullable(),
  request_type: z.enum(DATA_SUBJECT_REQUEST_TYPES),
  description: z
    .string()
    .trim()
    .min(20, 'La descripcion debe tener al menos 20 caracteres')
    .max(2000),
}).strict();

export const adminDataSubjectRequestUpdateSchema = z
  .object({
    status: z.enum(DATA_SUBJECT_REQUEST_STATUSES).optional(),
    admin_notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

type CreateDataSubjectRequestInput = z.infer<typeof dataSubjectRequestCreateSchema>;
export type AdminDataSubjectRequestUpdateInput = z.infer<
  typeof adminDataSubjectRequestUpdateSchema
>;

function normalizeNullableText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function calculateDataSubjectRequestDueAt(
  requestType: DataSubjectRequestType,
  submittedAt: Date = new Date()
): string {
  const dueAt = new Date(submittedAt);
  // Provisional product SLA indicator only: calendar-day approximation pending legal
  // validation. It must not be presented as an automatically compliant legal deadline.
  dueAt.setUTCDate(dueAt.getUTCDate() + (requestType === 'access' ? 10 : 15));
  return dueAt.toISOString();
}

export function buildDataSubjectRequestCreatePayload(input: {
  data: CreateDataSubjectRequestInput;
  identity: { userId: string; email: string } | null;
  submittedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}): Record<string, unknown> {
  const submittedAt = input.submittedAt.toISOString();
  return {
    user_id: input.identity?.userId || null,
    requester_email: (input.identity?.email || input.data.requester_email).trim().toLowerCase(),
    requester_name: normalizeNullableText(input.data.requester_name, 150),
    requester_document_id: normalizeNullableText(input.data.requester_document_id, 80),
    request_type: input.data.request_type,
    status: 'received',
    description: input.data.description,
    submitted_at: submittedAt,
    due_at: calculateDataSubjectRequestDueAt(input.data.request_type, input.submittedAt),
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
  };
}

export function buildAdminDataSubjectRequestUpdatePayload(input: {
  data: AdminDataSubjectRequestUpdateInput;
  currentStatus: DataSubjectRequestStatus;
  adminUserId: string | null;
  updatedAt: Date;
}): Record<string, unknown> {
  const updatedAt = input.updatedAt.toISOString();
  const payload: Record<string, unknown> = { updated_at: updatedAt };

  if (input.data.status && input.data.status !== input.currentStatus) {
    payload.status = input.data.status;
    const isFinal = input.data.status === 'resolved' || input.data.status === 'rejected';
    payload.resolved_at = isFinal ? updatedAt : null;
    payload.resolved_by = isFinal ? input.adminUserId : null;
  }

  if (input.data.admin_notes !== undefined) {
    payload.admin_notes = normalizeNullableText(input.data.admin_notes, 2000);
  }

  return payload;
}

type ExistingDataSubjectRequest = Pick<DataSubjectRequestRow, 'id' | 'status'>;

export type DataSubjectRequestOperation = 'update' | 'resolve' | 'reject' | 'reopen';

const ALLOWED_STATUS_TRANSITIONS: Record<
  DataSubjectRequestStatus,
  readonly DataSubjectRequestStatus[]
> = {
  received: ['in_review', 'awaiting_user_info', 'resolved', 'rejected'],
  in_review: ['awaiting_user_info', 'resolved', 'rejected'],
  awaiting_user_info: ['in_review', 'resolved', 'rejected'],
  resolved: ['in_review'],
  rejected: ['in_review'],
};

export function evaluateDataSubjectRequestTransition(input: {
  currentStatus: DataSubjectRequestStatus;
  nextStatus?: DataSubjectRequestStatus;
  adminNotes?: string | null;
}):
  | { valid: true; operation: DataSubjectRequestOperation; idempotent: boolean }
  | { valid: false; reason: 'not_allowed' | 'reopen_note_required' } {
  if (!input.nextStatus || input.nextStatus === input.currentStatus) {
    return { valid: true, operation: 'update', idempotent: Boolean(input.nextStatus) };
  }

  if (!ALLOWED_STATUS_TRANSITIONS[input.currentStatus].includes(input.nextStatus)) {
    return { valid: false, reason: 'not_allowed' };
  }

  const reopening =
    (input.currentStatus === 'resolved' || input.currentStatus === 'rejected') &&
    input.nextStatus === 'in_review';
  if (reopening && !input.adminNotes?.trim()) {
    return { valid: false, reason: 'reopen_note_required' };
  }

  return {
    valid: true,
    operation: reopening
      ? 'reopen'
      : input.nextStatus === 'resolved'
        ? 'resolve'
        : input.nextStatus === 'rejected'
          ? 'reject'
          : 'update',
    idempotent: false,
  };
}

export type UpdateDataSubjectRequestResult =
  | { kind: 'not_found' }
  | { kind: 'state_conflict' }
  | { kind: 'invalid_transition'; reason: 'not_allowed' | 'reopen_note_required' }
  | {
      kind: 'updated';
      previousStatus: DataSubjectRequestStatus;
      request: DataSubjectRequestRow;
      operation: DataSubjectRequestOperation;
      idempotent: boolean;
    };

export async function updateDataSubjectRequest(input: {
  id: string;
  data: AdminDataSubjectRequestUpdateInput;
  adminUserId: string | null;
  updatedAt?: Date;
  findById(id: string): Promise<ExistingDataSubjectRequest | null>;
  updateById(
    id: string,
    payload: Record<string, unknown>,
    expectedStatus: DataSubjectRequestStatus
  ): Promise<DataSubjectRequestRow | null>;
}): Promise<UpdateDataSubjectRequestResult> {
  const existing = await input.findById(input.id);
  if (!existing) return { kind: 'not_found' };

  const transition = evaluateDataSubjectRequestTransition({
    currentStatus: existing.status,
    nextStatus: input.data.status,
    adminNotes: input.data.admin_notes,
  });
  if (!transition.valid) {
    return { kind: 'invalid_transition', reason: transition.reason };
  }

  const request = await input.updateById(
    input.id,
    buildAdminDataSubjectRequestUpdatePayload({
      data: input.data,
      currentStatus: existing.status,
      adminUserId: input.adminUserId,
      updatedAt: input.updatedAt || new Date(),
    }),
    existing.status
  );
  if (!request) return { kind: 'state_conflict' };

  return {
    kind: 'updated',
    previousStatus: existing.status,
    request,
    operation: transition.operation,
    idempotent: transition.idempotent,
  };
}
