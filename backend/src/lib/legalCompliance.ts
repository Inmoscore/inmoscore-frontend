import { supabase } from './supabase';

export const LEGAL_DOCUMENT_TYPES = [
  'privacy_policy',
  'terms_conditions',
  'scoring_authorization',
  'habeas_data_authorization',
  'cookies_policy',
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export type LegalDocumentVersion = {
  id: string;
  document_type: LegalDocumentType;
  version: string;
  title: string;
  content_hash: string;
  is_active: boolean;
  effective_date: string;
  created_at: string;
  created_by: string | null;
};

export type UserLegalAcceptance = {
  id: string;
  user_id: string;
  document_type: LegalDocumentType;
  document_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  acceptance_method: string;
  consent_purposes: Record<string, unknown>;
  created_at: string;
};

type RegisterLegalAcceptanceInput = {
  userId: string;
  documentType: LegalDocumentType;
  documentVersion: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  acceptanceMethod?: string;
  consentPurposes?: Record<string, unknown>;
  acceptedAt?: string;
  marketingConsent?: boolean;
};

export function isValidLegalDocumentType(value: unknown): value is LegalDocumentType {
  return (
    typeof value === 'string' &&
    (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

function normalizeAuditText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function assertUserExists(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[LEGAL_COMPLIANCE]', { action: 'assert_user', error: error.message });
    throw new Error('No se pudo validar el usuario');
  }

  if (!data) {
    throw new Error('Usuario no encontrado');
  }
}

async function getLegalDocumentByVersion(
  documentType: LegalDocumentType,
  version: string
): Promise<LegalDocumentVersion | null> {
  const { data, error } = await supabase
    .from('legal_document_versions')
    .select(
      'id, document_type, version, title, content_hash, is_active, effective_date, created_at, created_by'
    )
    .eq('document_type', documentType)
    .eq('version', version)
    .maybeSingle();

  if (error) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'get_document_by_version',
      document_type: documentType,
      error: error.message,
    });
    throw new Error('No se pudo validar la version legal');
  }

  return data as LegalDocumentVersion | null;
}

export async function getActiveLegalDocument(
  documentType: LegalDocumentType
): Promise<LegalDocumentVersion | null> {
  if (!isValidLegalDocumentType(documentType)) {
    throw new Error('Tipo de documento legal invalido');
  }

  const { data, error } = await supabase
    .from('legal_document_versions')
    .select(
      'id, document_type, version, title, content_hash, is_active, effective_date, created_at, created_by'
    )
    .eq('document_type', documentType)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'get_active_document',
      document_type: documentType,
      error: error.message,
    });
    throw new Error('No se pudo consultar la version legal activa');
  }

  return data as LegalDocumentVersion | null;
}

export async function getActiveLegalDocuments(): Promise<LegalDocumentVersion[]> {
  const documents = await Promise.all(
    LEGAL_DOCUMENT_TYPES.map((documentType) => getActiveLegalDocument(documentType))
  );

  return documents.filter((document): document is LegalDocumentVersion => Boolean(document));
}

export async function getUserLatestAcceptance(
  userId: string,
  documentType: LegalDocumentType
): Promise<UserLegalAcceptance | null> {
  if (!isValidLegalDocumentType(documentType)) {
    throw new Error('Tipo de documento legal invalido');
  }

  await assertUserExists(userId);

  const { data, error } = await supabase
    .from('user_legal_acceptances')
    .select(
      'id, user_id, document_type, document_version, accepted_at, ip_address, user_agent, acceptance_method, consent_purposes, created_at'
    )
    .eq('user_id', userId)
    .eq('document_type', documentType)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'get_latest_acceptance',
      document_type: documentType,
      error: error.message,
    });
    throw new Error('No se pudo consultar la aceptacion legal');
  }

  return data as UserLegalAcceptance | null;
}

function buildUserLegalUpdate(
  documentType: LegalDocumentType,
  acceptedAt: string,
  documentVersion: string,
  marketingConsent?: boolean
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    legal_compliance_version: documentVersion,
  };

  if (documentType === 'privacy_policy') {
    update.privacy_policy_accepted_at = acceptedAt;
  }

  if (documentType === 'terms_conditions') {
    update.terms_accepted_at = acceptedAt;
  }

  if (documentType === 'scoring_authorization') {
    update.scoring_consent_accepted_at = acceptedAt;
  }

  if (typeof marketingConsent === 'boolean') {
    update.marketing_consent = marketingConsent;
  }

  return update;
}

export async function registerLegalAcceptance(
  input: RegisterLegalAcceptanceInput
): Promise<UserLegalAcceptance> {
  if (!isValidLegalDocumentType(input.documentType)) {
    throw new Error('Tipo de documento legal invalido');
  }

  const documentVersion = input.documentVersion.trim();

  if (!documentVersion) {
    throw new Error('Version legal requerida');
  }

  await assertUserExists(input.userId);

  const document = await getLegalDocumentByVersion(input.documentType, documentVersion);

  if (!document) {
    throw new Error('Version legal inexistente');
  }

  const acceptedAt = input.acceptedAt || new Date().toISOString();
  const acceptanceMethod = normalizeAuditText(input.acceptanceMethod, 80) || 'checkbox';

  const { data, error } = await supabase
    .from('user_legal_acceptances')
    .insert({
      user_id: input.userId,
      document_type: input.documentType,
      document_version: documentVersion,
      accepted_at: acceptedAt,
      ip_address: normalizeAuditText(input.ipAddress, 120),
      user_agent: normalizeAuditText(input.userAgent, 500),
      acceptance_method: acceptanceMethod,
      consent_purposes: input.consentPurposes || {},
    })
    .select(
      'id, user_id, document_type, document_version, accepted_at, ip_address, user_agent, acceptance_method, consent_purposes, created_at'
    )
    .single();

  if (error || !data) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'register_acceptance',
      document_type: input.documentType,
      user_id: input.userId,
      error: error?.message || 'no_data',
    });
    throw new Error('No se pudo registrar la aceptacion legal');
  }

  const userUpdate = buildUserLegalUpdate(
    input.documentType,
    acceptedAt,
    documentVersion,
    input.marketingConsent
  );

  const { error: updateError } = await supabase
    .from('users')
    .update(userUpdate)
    .eq('id', input.userId);

  if (updateError) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'update_user_fast_fields',
      document_type: input.documentType,
      user_id: input.userId,
      error: updateError.message,
    });
    throw new Error('No se pudo actualizar el estado legal del usuario');
  }

  console.log('[LEGAL_COMPLIANCE]', {
    action: 'acceptance_registered',
    document_type: input.documentType,
    document_version: documentVersion,
    user_id: input.userId,
  });

  return data as UserLegalAcceptance;
}
