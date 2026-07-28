import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import dns from 'dns';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import billingRouter, { stripeWebhookHandler } from './routes/billing';
import wompiBillingRouter, { wompiWebhookHandler } from './routes/wompiBilling';
import {
  WompiTransactionLookupError,
  getWompiTransactionById,
} from './lib/wompi';
import {
  LEGAL_DOCUMENT_TYPES,
  LegalDocumentType,
  getActiveLegalDocuments,
  isValidLegalDocumentType,
  registerLegalAcceptance,
} from './lib/legalCompliance';
import { SCORE_CONFIG } from './scoring/core/config';
import { calculateAndStoreScore, getCurrentScore } from './scoring/services/ScoreService';
import { AdminAuditSeverity, logAdminAction } from './lib/adminAudit';
import { logAuthenticationAudit } from './lib/authenticationAudit';
import {
  passwordResetCompleteSchema,
  synchronizeRecoveredPassword,
  verifyPasswordWithAnonymousClient,
} from './lib/passwordRecovery';
import { appendPublicPath, resolvePublicFrontendUrl } from './lib/publicUrl';
import { buildAllowedOrigins, isCorsOriginAllowed } from './lib/corsOrigins';
import { logLegalReportAudit } from './lib/legalReportAudit';
import { logSecurityEvent } from './securityAudit';
import {
  BackupCodeHash,
  buildOtpauthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyBackupCode,
  verifyTotpToken,
} from './lib/adminMfa';
import {
  createDocumentUploadIntent,
  createSignedReadUrl,
  createSignedUpload,
  confirmDocumentUpload,
  logDocumentAccess,
  secureDocumentUploadIntentSchema,
  SIGNED_READ_EXPIRES_IN_SECONDS,
  SIGNED_UPLOAD_EXPIRES_IN_SECONDS,
  verifyObjectExists,
} from './lib/secureDocuments';
import { verifyTurnstileToken } from './lib/turnstile';

type SecureDocumentAccessMetadata = {
  id: string;
  owner_user_id: string | null;
  related_entity_type: string;
  related_entity_id: string | null;
  document_category: string;
  bucket_name: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string | null;
  status: string;
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

// ================================
// NETWORK / ENV
// ================================

dns.setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

const {
  PORT = '3001',
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  JWT_SECRET,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !JWT_SECRET) {
  console.error('❌ Error: faltan variables requeridas en backend/.env');
  console.error(
    'Requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, JWT_SECRET'
  );
  process.exit(1);
}

// ================================
// APP / CLIENTS
// ================================

const app = express();

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ================================
// TYPES
// ================================

interface JwtPayload {
  id: string;
  email: string;
  tipo_usuario: string;
}

interface AuthRequest extends Request {
  user?: JwtPayload;
}

const PUBLIC_FRONTEND_URL = resolvePublicFrontendUrl(process.env);

type IdentityGateRow = {
  id: string;
  identity_verification_status: string | null;
  reporting_eligibility_status?: string | null;
};

type AdminReporterUser = {
  id: string;
  nombre: string;
  email: string;
  tipo_usuario: string;
};

type AdminReportRow = {
  id: string;
  tenant_id: string;
  tipo_problema: string;
  descripcion: string;
  fecha_reporte: string;
  estado: string;
  reportado_por: string | null;
  data_origin: string | null;
  source_type: LegalTraceSourceType | null;
  source_name: string | null;
  source_reference: string | null;
  source_url: string | null;
  legal_basis: LegalTraceLegalBasis | null;
  consent_required: boolean | null;
  consent_verified: boolean | null;
  public_source_flag: boolean | null;
  impacts_scoring: boolean | null;
  dispute_status: LegalTraceDisputeStatus | null;
  legal_review_status: LegalTraceReviewStatus | null;
  legal_notes: string | null;
  created_by_admin_id: string | null;
  verified_by_admin_id: string | null;
  verified_at: string | null;
  tenants:
    | {
        nombre: string;
        cedula: string;
        ciudad: string;
      }
    | {
        nombre: string;
        cedula: string;
        ciudad: string;
      }[]
    | null;
};

type CreatedReportRow = {
  id: string;
  tenant_id: string;
  tipo_problema: string;
  descripcion: string;
  fecha_reporte: string;
  estado: string;
  reportado_por: string;
  data_origin?: string | null;
  source_type?: LegalTraceSourceType | null;
  source_name?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  legal_basis?: LegalTraceLegalBasis | null;
  consent_required?: boolean | null;
  consent_verified?: boolean | null;
  public_source_flag?: boolean | null;
  impacts_scoring?: boolean | null;
  dispute_status?: LegalTraceDisputeStatus | null;
  legal_review_status?: LegalTraceReviewStatus | null;
  legal_notes?: string | null;
  created_by_admin_id?: string | null;
  verified_by_admin_id?: string | null;
  verified_at?: string | null;
  evidence_required?: boolean | null;
  evidence_status?: string | null;
  legal_declaration_accepted?: boolean | null;
  legal_declaration_text?: string | null;
  report_verification_status?: string | null;
  reviewed_by_admin_id?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  legal_review_notes?: string | null;
  scoring_eligibility_status?: string | null;
  subject_notice_required?: boolean | null;
  subject_notice_status?: SubjectNoticeStatus | null;
  contradiction_status?: ContradictionStatus | null;
  contradiction_deadline?: string | null;
  report_review_logs?: ReportReviewLogRow[];
  subject_notices?: ReportSubjectNoticeRow[];
};

type AdminActionRow = {
  id: string;
  report_id: string | null;
  rental_history_id?: string | null;
  admin_user_id: string;
  accion: 'aprobado' | 'rechazado' | string | null;
  action?: string | null;
  fecha_accion: string;
  timestamp?: string | null;
};

type AdminActionReportRow = {
  id: string;
  tipo_problema: string;
  descripcion: string;
  estado: string;
  reportado_por: string | null;
};

type AdminActionRentalHistoryRow = {
  id: string;
  cedula_inquilino: string;
  lessor_name: string | null;
  city: string | null;
  property_type: string | null;
  status: string;
};

type UnifiedAdminDecisionAction = {
  id: string;
  action: string;
  accion: string | null;
  admin_user_id: string | null;
  report_id: string | null;
  rental_history_id: string | null;
  timestamp: string;
  fecha_accion: string;
  resource_type: 'report' | 'rental_history';
  resource_label: string;
  resource_summary: string | null;
};

type ReportReviewAction =
  | 'mark_in_review'
  | 'request_more_info'
  | 'approve'
  | 'reject'
  | 'block_scoring';

type ReportVerificationStatus =
  | 'pending_verification'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'needs_more_info';

type ScoringEligibilityStatus = 'not_eligible' | 'eligible' | 'blocked' | 'expired';

type SubjectNoticeStatus = 'pending' | 'sent' | 'failed' | 'waived' | 'not_required';

type ContradictionStatus =
  | 'none'
  | 'received'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'expired';

type ReportNoticeAction =
  | 'mark_notice_sent'
  | 'mark_notice_failed'
  | 'waive_notice'
  | 'record_contradiction'
  | 'mark_contradiction_accepted'
  | 'mark_contradiction_rejected'
  | 'mark_contradiction_expired';

type ReportReviewLogRow = {
  id: string;
  report_id: string;
  admin_id: string;
  previous_status: ReportVerificationStatus | null;
  new_status: ReportVerificationStatus;
  previous_scoring_eligibility_status: ScoringEligibilityStatus | null;
  new_scoring_eligibility_status: ScoringEligibilityStatus;
  notes: string | null;
  created_at: string;
};

type ReportSubjectNoticeRow = {
  id: string;
  report_id: string;
  subject_document_number: string;
  subject_email: string | null;
  notice_status: SubjectNoticeStatus;
  notice_channel: string;
  notice_reference: string | null;
  notice_sent_at: string | null;
  contradiction_deadline: string | null;
  contradiction_received_at: string | null;
  contradiction_status: ContradictionStatus;
  contradiction_summary: string | null;
  created_at: string;
  updated_at: string;
};

type AdminUserPlan = 'free' | 'basic' | 'pro' | 'admin';

type AdminPlanChangeLogRow = {
  id: string;
  admin_user_id: string | null;
  target_user_id: string | null;
  previous_plan_type: string | null;
  new_plan_type: string;
  previous_daily_search_limit: number | null;
  new_daily_search_limit: number | null;
  reason: string | null;
  payment_id: string | null;
  payment_reference: string | null;
  payment_provider: string | null;
  created_at: string;
};

type AdminPlanChangeLogResponseRow = AdminPlanChangeLogRow & {
  admin_user: AdminReporterUser | null;
  target_user: AdminReporterUser | null;
};

type AdminWompiPaymentRow = {
  id: string;
  user_id: string | null;
  plan_type: string;
  amount_in_cents: number;
  currency: string;
  reference: string;
  status: string;
  wompi_status: string | null;
  wompi_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  users?: { email: string | null } | { email: string | null }[] | null;
};

type AdminWompiPaymentResponseRow = {
  payment_id: string;
  user_id: string | null;
  user_email: string | null;
  plan_type: string;
  amount_in_cents: number;
  currency: string;
  reference: string;
  internal_status: string;
  wompi_status: string | null;
  wompi_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

type AdminWompiVerifyPaymentRow = {
  id: string;
  reference: string;
  status: string;
  wompi_transaction_id: string | null;
  amount_in_cents: number;
  currency: string;
};

type AdminWompiReconcilePaymentRow = AdminWompiVerifyPaymentRow & {
  user_id: string | null;
  plan_type: string;
  wompi_status: string | null;
  processed_at: string | null;
  updated_at: string;
};

type AdminWompiReconcileUserRow = {
  id: string;
  plan_type: string | null;
  daily_search_limit: number | null;
};

type AdminRentalHistoryStatus = 'verified' | 'rejected' | 'disputed';

type SearchCreditGrantReason =
  | 'granted'
  | 'already_granted'
  | 'monthly_limit_reached'
  | 'not_applicable';

type SearchCreditGrantResult = {
  granted: boolean;
  reason: SearchCreditGrantReason;
};

type SearchLimitDecision = {
  allowed: boolean;
  limitInfo: {
    plan_type: string;
    daily_limit: number | null;
    used_searches: number;
    remaining_searches: number | null;
    bonus_credits_available: number | null;
    bonus_credit_used: boolean;
  };
  bonusCreditId: string | null;
};

type SupabaseRpcErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type LegalCaseSignalRow = {
  id: string;
  tenant_id: string;
  source: string;
  source_reference: string | null;
  source_url: string | null;
  data_origin: string | null;
  source_type: LegalTraceSourceType | null;
  source_name: string | null;
  legal_basis: LegalTraceLegalBasis | null;
  consent_required: boolean | null;
  consent_verified: boolean | null;
  public_source_flag: boolean | null;
  impacts_scoring: boolean | null;
  cedula_consultada: string;
  process_type: string | null;
  process_subject: string | null;
  court_name: string | null;
  city: string | null;
  process_date: string | null;
  detection_date: string;
  status: 'detected' | 'under_review' | 'verified' | 'rejected';
  verification_notes: string | null;
  verified_by_admin_id: string | null;
  verified_at: string | null;
  rejected_by_admin_id: string | null;
  rejected_at: string | null;
  dispute_status: LegalTraceDisputeStatus;
  dispute_notes: string | null;
  disputed_at: string | null;
  legal_review_status: LegalTraceReviewStatus | null;
  legal_notes: string | null;
  created_by_admin_id: string | null;
  relevance_for_rental_risk: boolean;
  score_impact_enabled: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  tenants?: {
    id: string;
    nombre: string;
    cedula: string;
    ciudad: string;
  } | null;
};

type LegalCaseSignalPatchBody = {
  status?: 'detected' | 'under_review' | 'verified' | 'rejected';
  verification_notes?: string;
  dispute_status?: LegalTraceDisputeStatus;
  dispute_notes?: string;
  relevance_for_rental_risk?: boolean;
  score_impact_enabled?: boolean;
  data_origin?: string | null;
  source_type?: LegalTraceSourceType | null;
  source_name?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  legal_basis?: LegalTraceLegalBasis | null;
  public_source_flag?: boolean | null;
  impacts_scoring?: boolean | null;
  legal_review_status?: LegalTraceReviewStatus | null;
  legal_notes?: string | null;
};

type SearchLogInsert = {
  user_id: string | null;
  tenant_id: string | null;
  cedula_consultada: string;
  found: boolean;
  score_normalized: number | null;
  classification: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

type SearchAuditLogInsert = {
  tenant_id: string | null;
  user_id: string | null;
  searched_document: string;
  normalized_document: string;
  search_status: string;
  result_status: string | null;
  http_status: number | null;
  credits_before: number | null;
  credits_after: number | null;
  plan_code: string | null;
  used_extra_credit: boolean;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

type SearchAuditRequestContext = {
  searchedDocument: string;
  normalizedDocument: string;
  requestIp: string | null;
  requestUserAgent: string | null;
  requestId: string | null;
};

type DataSubjectRequestType =
  | 'access'
  | 'correction'
  | 'deletion'
  | 'authorization_revocation'
  | 'claim'
  | 'other';

type DataSubjectRequestStatus =
  | 'received'
  | 'in_review'
  | 'awaiting_user_info'
  | 'resolved'
  | 'rejected';

type DataSubjectRequestRow = {
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

type DataDisputeTargetType =
  | 'report'
  | 'judicial_signal'
  | 'score'
  | 'search_result'
  | 'other';

type DataDisputeType =
  | 'inaccurate'
  | 'outdated'
  | 'paid_or_resolved'
  | 'identity_theft'
  | 'unauthorized_processing'
  | 'not_mine'
  | 'other';

type DataDisputeStatus =
  | 'received'
  | 'in_review'
  | 'awaiting_user_info'
  | 'accepted'
  | 'rejected'
  | 'resolved';

type HumanReviewRequestReason =
  | 'disputed_information'
  | 'outdated_information'
  | 'inaccurate_score'
  | 'identity_theft'
  | 'automated_decision_concern'
  | 'other';

type HumanReviewRequestStatus =
  | 'received'
  | 'in_review'
  | 'awaiting_user_info'
  | 'resolved'
  | 'rejected';

type DataDisputeRow = {
  id: string;
  user_id: string | null;
  requester_email: string;
  requester_name: string | null;
  requester_document_id: string | null;
  target_type: DataDisputeTargetType;
  target_id: string | null;
  target_reference: string | null;
  dispute_type: DataDisputeType;
  status: DataDisputeStatus;
  description: string;
  evidence_url: string | null;
  admin_notes: string | null;
  resolution_summary: string | null;
  submitted_at: string;
  due_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type HumanReviewRequestRow = {
  id: string;
  user_id: string | null;
  requester_email: string;
  requester_name: string | null;
  requester_document_id: string | null;
  cedula_consultada: string | null;
  current_score: number | null;
  current_classification: string | null;
  reason: HumanReviewRequestReason;
  description: string;
  status: HumanReviewRequestStatus;
  admin_notes: string | null;
  review_summary: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type LegalTraceSourceType =
  | 'user_provided'
  | 'admin_provided'
  | 'public_registry'
  | 'judicial_public_source'
  | 'third_party_report'
  | 'system_generated';

type LegalTraceLegalBasis =
  | 'consent'
  | 'public_source'
  | 'legitimate_interest'
  | 'contract'
  | 'legal_obligation';

type LegalTraceDisputeStatus = 'none' | 'disputed' | 'resolved' | 'rejected';

type LegalTraceReviewStatus =
  | 'pending'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'needs_more_info';

type DataInventoryDomain =
  | 'users'
  | 'reports'
  | 'judicial_signals'
  | 'searches'
  | 'payments'
  | 'scoring'
  | 'admin_audit'
  | 'legal_requests';

type DataInventoryCategory =
  | 'identification'
  | 'contact'
  | 'financial'
  | 'behavioral'
  | 'judicial'
  | 'transactional'
  | 'technical'
  | 'legal'
  | 'derived_score';

type DataInventorySensitivity = 'low' | 'medium' | 'high' | 'sensitive';

type DataInventorySourceType =
  | 'user_provided'
  | 'admin_provided'
  | 'public_registry'
  | 'third_party_report'
  | 'system_generated'
  | 'payment_provider';

type DataInventoryLegalBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'public_source'
  | 'legitimate_interest';

type DataInventoryItemRow = {
  id: string;
  data_domain: DataInventoryDomain;
  field_name: string;
  description: string;
  data_category: DataInventoryCategory;
  sensitivity_level: DataInventorySensitivity;
  source_type: DataInventorySourceType;
  legal_basis: DataInventoryLegalBasis;
  purpose: string;
  retention_policy: string;
  retention_days: number | null;
  impacts_scoring: boolean;
  requires_consent: boolean;
  is_public_source: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SearchRentalHistoryRow = {
  id: string;
  subject_type: string | null;
  subject_document_type: string | null;
  subject_document_number: string | null;
  source_type: string | null;
  city: string | null;
  property_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_duration_months: number | null;
  monthly_rent_amount: number | null;
  currency: string | null;
  had_late_payments: boolean | null;
  late_payment_months: number | null;
  had_property_damage: boolean | null;
  formal_handover: boolean | null;
  had_debt_at_handover: boolean | null;
  has_supporting_documents: boolean | null;
  verified_at: string | null;
  visibility_level: string;
};

type SearchLegalFlags = {
  has_disputed_items: boolean;
  disputed_reports_count: number;
  disputed_judicial_signals_count: number;
  has_items_pending_legal_review: boolean;
  pending_legal_review_count: number;
  has_reports_not_eligible_for_scoring: boolean;
  reports_not_eligible_for_scoring_count: number;
};

type ScoreExplanationFactor = {
  key: string;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  severity: 'low' | 'medium' | 'high';
  description: string;
  impacts_score: boolean;
  disputed: boolean;
  pending_legal_review: boolean;
};

type AdminAuditLogRow = {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action_type: string;
  severity: AdminAuditSeverity;
  target_type: string;
  target_id: string | null;
  target_reference: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
};

// ================================
// VALIDATIONS
// ================================

const DATA_SUBJECT_REQUEST_TYPES = [
  'access',
  'correction',
  'deletion',
  'authorization_revocation',
  'claim',
  'other',
] as const;

const DATA_SUBJECT_REQUEST_STATUSES = [
  'received',
  'in_review',
  'awaiting_user_info',
  'resolved',
  'rejected',
] as const;

const DATA_DISPUTE_TARGET_TYPES = [
  'report',
  'judicial_signal',
  'score',
  'search_result',
  'other',
] as const;

const DATA_DISPUTE_TYPES = [
  'inaccurate',
  'outdated',
  'paid_or_resolved',
  'identity_theft',
  'unauthorized_processing',
  'not_mine',
  'other',
] as const;

const DATA_DISPUTE_STATUSES = [
  'received',
  'in_review',
  'awaiting_user_info',
  'accepted',
  'rejected',
  'resolved',
] as const;

const HUMAN_REVIEW_REQUEST_REASONS = [
  'disputed_information',
  'outdated_information',
  'inaccurate_score',
  'identity_theft',
  'automated_decision_concern',
  'other',
] as const;

const HUMAN_REVIEW_REQUEST_STATUSES = [
  'received',
  'in_review',
  'awaiting_user_info',
  'resolved',
  'rejected',
] as const;

const DATA_INVENTORY_DOMAINS = [
  'users',
  'reports',
  'judicial_signals',
  'searches',
  'payments',
  'scoring',
  'admin_audit',
  'legal_requests',
] as const;

const DATA_INVENTORY_CATEGORIES = [
  'identification',
  'contact',
  'financial',
  'behavioral',
  'judicial',
  'transactional',
  'technical',
  'legal',
  'derived_score',
] as const;

const DATA_INVENTORY_SENSITIVITY_LEVELS = ['low', 'medium', 'high', 'sensitive'] as const;

const DATA_INVENTORY_SOURCE_TYPES = [
  'user_provided',
  'admin_provided',
  'public_registry',
  'third_party_report',
  'system_generated',
  'payment_provider',
] as const;

const DATA_INVENTORY_LEGAL_BASES = [
  'consent',
  'contract',
  'legal_obligation',
  'public_source',
  'legitimate_interest',
] as const;

const LEGAL_TRACE_SOURCE_TYPES = [
  'user_provided',
  'admin_provided',
  'public_registry',
  'judicial_public_source',
  'third_party_report',
  'system_generated',
] as const;

const LEGAL_TRACE_LEGAL_BASES = [
  'consent',
  'public_source',
  'legitimate_interest',
  'contract',
  'legal_obligation',
] as const;

const LEGAL_TRACE_DISPUTE_STATUSES = ['none', 'disputed', 'resolved', 'rejected'] as const;

const LEGAL_TRACE_REVIEW_STATUSES = [
  'pending',
  'reviewed',
  'approved',
  'rejected',
  'needs_more_info',
] as const;

const REPORT_VERIFICATION_STATUSES = [
  'pending_verification',
  'in_review',
  'verified',
  'rejected',
  'needs_more_info',
] as const;

const SCORING_ELIGIBILITY_STATUSES = [
  'not_eligible',
  'eligible',
  'blocked',
  'expired',
] as const;

const REPORT_REVIEW_ACTIONS = [
  'mark_in_review',
  'request_more_info',
  'approve',
  'reject',
  'block_scoring',
] as const;

const REPORT_NOTICE_ACTIONS = [
  'mark_notice_sent',
  'mark_notice_failed',
  'waive_notice',
  'record_contradiction',
  'mark_contradiction_accepted',
  'mark_contradiction_rejected',
  'mark_contradiction_expired',
] as const;

const ADMIN_PENDING_REPORT_VERIFICATION_STATUSES = [
  'pending_verification',
  'in_review',
  'needs_more_info',
] as const;

const ADMIN_PENDING_LEGAL_REVIEW_STATUSES = [
  'pending',
  'needs_more_info',
] as const;

const SUBJECT_NOTICE_STATUSES = [
  'pending',
  'sent',
  'failed',
  'waived',
  'not_required',
] as const;

const CONTRADICTION_STATUSES = [
  'none',
  'received',
  'under_review',
  'accepted',
  'rejected',
  'expired',
] as const;

const REPORT_LEGAL_DECLARATION_TEXT =
  'Declaro bajo gravedad de juramento que la información reportada es veraz, que tengo una relación legítima con los hechos reportados y que cuento con soportes documentales para respaldarla.';

const REPORT_SELECT_COLUMNS = [
  'id',
  'tenant_id',
  'tipo_problema',
  'descripcion',
  'fecha_reporte',
  'estado',
  'reportado_por',
  'data_origin',
  'source_type',
  'source_name',
  'source_reference',
  'source_url',
  'legal_basis',
  'consent_required',
  'consent_verified',
  'public_source_flag',
  'impacts_scoring',
  'dispute_status',
  'legal_review_status',
  'legal_notes',
  'created_by_admin_id',
  'verified_by_admin_id',
  'verified_at',
  'evidence_required',
  'evidence_status',
  'legal_declaration_accepted',
  'legal_declaration_text',
  'report_verification_status',
  'reviewed_by_admin_id',
  'reviewed_at',
  'rejection_reason',
  'legal_review_notes',
  'scoring_eligibility_status',
  'subject_notice_required',
  'subject_notice_status',
  'contradiction_status',
  'contradiction_deadline',
] as const;

const REPORT_EVIDENCE_SELECT_COLUMNS = [
  'id',
  'report_id',
  'uploaded_by_user_id',
  'evidence_type',
  'file_name',
  'storage_path',
  'mime_type',
  'file_size',
  'sha256_hash',
  'legal_declaration_accepted',
  'uploaded_at',
  'created_at',
] as const;

const SEARCH_REPORT_SELECT_COLUMNS = [
  'id',
  'tenant_id',
  'tipo_problema',
  'descripcion',
  'fecha_reporte',
  'estado',
  'dispute_status',
  'legal_review_status',
  'public_source_flag',
  'source_type',
  'impacts_scoring',
  'report_verification_status',
  'scoring_eligibility_status',
  'subject_notice_status',
  'contradiction_status',
  'contradiction_deadline',
] as const;

const REPORT_REVIEW_LOG_SELECT_COLUMNS = [
  'id',
  'report_id',
  'admin_id',
  'previous_status',
  'new_status',
  'previous_scoring_eligibility_status',
  'new_scoring_eligibility_status',
  'notes',
  'created_at',
] as const;

const REPORT_SUBJECT_NOTICE_SELECT_COLUMNS = [
  'id',
  'report_id',
  'subject_document_number',
  'subject_email',
  'notice_status',
  'notice_channel',
  'notice_reference',
  'notice_sent_at',
  'contradiction_deadline',
  'contradiction_received_at',
  'contradiction_status',
  'contradiction_summary',
  'created_at',
  'updated_at',
] as const;

const ADMIN_AUDIT_LOG_SELECT_COLUMNS = [
  'id',
  'admin_user_id',
  'admin_email',
  'action_type',
  'severity',
  'target_type',
  'target_id',
  'target_reference',
  'previous_state',
  'new_state',
  'reason',
  'ip_address',
  'user_agent',
  'request_id',
  'created_at',
] as const;

const LEGAL_CASE_SIGNAL_SELECT_COLUMNS = [
  'id',
  'tenant_id',
  'source',
  'source_reference',
  'source_url',
  'data_origin',
  'source_type',
  'source_name',
  'legal_basis',
  'consent_required',
  'consent_verified',
  'public_source_flag',
  'impacts_scoring',
  'cedula_consultada',
  'process_type',
  'process_subject',
  'court_name',
  'city',
  'process_date',
  'detection_date',
  'status',
  'verification_notes',
  'verified_by_admin_id',
  'verified_at',
  'rejected_by_admin_id',
  'rejected_at',
  'dispute_status',
  'dispute_notes',
  'disputed_at',
  'legal_review_status',
  'legal_notes',
  'created_by_admin_id',
  'relevance_for_rental_risk',
  'score_impact_enabled',
  'metadata',
  'created_at',
  'updated_at',
] as const;

const SEARCH_LEGAL_CASE_SIGNAL_SELECT_COLUMNS = [
  'id',
  'tenant_id',
  'source',
  'source_reference',
  'source_type',
  'public_source_flag',
  'impacts_scoring',
  'process_type',
  'process_subject',
  'court_name',
  'city',
  'process_date',
  'status',
  'dispute_status',
  'legal_review_status',
  'relevance_for_rental_risk',
  'score_impact_enabled',
] as const;

const DATA_DISPUTE_SELECT_COLUMNS = [
  'id',
  'user_id',
  'requester_email',
  'requester_name',
  'requester_document_id',
  'target_type',
  'target_id',
  'target_reference',
  'dispute_type',
  'status',
  'description',
  'evidence_url',
  'admin_notes',
  'resolution_summary',
  'submitted_at',
  'due_at',
  'resolved_at',
  'resolved_by',
  'created_at',
  'updated_at',
] as const;

const HUMAN_REVIEW_REQUEST_SELECT_COLUMNS = [
  'id',
  'user_id',
  'requester_email',
  'requester_name',
  'requester_document_id',
  'cedula_consultada',
  'current_score',
  'current_classification',
  'reason',
  'description',
  'status',
  'admin_notes',
  'review_summary',
  'resolved_at',
  'resolved_by',
  'created_at',
  'updated_at',
] as const;

const IDENTITY_VERIFICATION_USER_SELECT_COLUMNS = [
  'id',
  'email',
  'nombre',
  'identity_verification_status',
  'identity_verified_at',
  'identity_verification_method',
  'identity_verification_notes',
  'reporting_eligibility_status',
  'fecha_registro',
] as const;

const registerSchema = z
  .object({
    nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
    fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    phone: z.string().optional().nullable(),
    document_type: z.string().trim().max(20).optional().default('CC'),
    document_number: z.string().trim().min(4).max(40).optional().nullable(),
    cedula: z.string().trim().min(4).max(40).optional().nullable(),
    turnstileToken: z.string().trim().min(1).optional(),
    tipo_usuario: z.string().optional(),
    legal_acceptances: z
      .array(
        z.object({
          document_type: z.enum(LEGAL_DOCUMENT_TYPES),
          document_version: z.string().trim().min(1).max(80),
          acceptance_method: z.string().trim().max(80).optional(),
          consent_purposes: z.record(z.string(), z.unknown()).optional().default({}),
        })
      )
      .max(10)
      .optional(),
    marketing_consent: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.nombre || data.fullName), {
    message: 'El nombre es requerido',
    path: ['nombre'],
  })
  .refine((data) => data.password.length >= 8, {
    message: 'La contrasena debe tener al menos 8 caracteres',
    path: ['password'],
  });

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
  turnstileToken: z.string().trim().min(1).optional(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('Email invalido'),
  turnstileToken: z.string().trim().min(1).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'La contrasena actual es requerida').optional(),
  new_password: z.string().min(8, 'La nueva contrasena debe tener al menos 8 caracteres'),
});

const upgradeEventSchema = z.object({
  event_type: z.enum([
    'upgrade_cta_clicked',
    'plan_basic_clicked',
    'plan_pro_clicked',
    'enterprise_clicked',
  ]),
  source: z.enum([
    'buscar_limit_card',
    'upgrade_page',
  ]),
  plan_type: z.enum(['free', 'basic', 'pro', 'enterprise']).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const consentPurposesSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .default({});

const legalAcceptanceInputSchema = z.object({
  document_type: z.enum(LEGAL_DOCUMENT_TYPES),
  document_version: z.string().trim().min(1).max(80),
  acceptance_method: z.string().trim().max(80).optional(),
  consent_purposes: consentPurposesSchema,
});

const legalAcceptancesBodySchema = z
  .object({
    document_type: z.enum(LEGAL_DOCUMENT_TYPES).optional(),
    document_version: z.string().trim().min(1).max(80).optional(),
    acceptance_method: z.string().trim().max(80).optional(),
    consent_purposes: consentPurposesSchema,
    acceptances: z.array(legalAcceptanceInputSchema).min(1).max(10).optional(),
    marketing_consent: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.acceptances?.length) {
      return;
    }

    if (!body.document_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'document_type es requerido',
        path: ['document_type'],
      });
    }

    if (!body.document_version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'document_version es requerido',
        path: ['document_version'],
      });
    }
  });

const dataSubjectRequestCreateSchema = z.object({
  requester_email: z.string().trim().email('Email invalido').max(180),
  requester_name: z.string().trim().max(150).optional().nullable(),
  requester_document_id: z.string().trim().max(80).optional().nullable(),
  request_type: z.enum(DATA_SUBJECT_REQUEST_TYPES),
  description: z.string().trim().min(20, 'La descripcion debe tener al menos 20 caracteres').max(2000),
});

const dataDisputeCreateSchema = z
  .object({
    requester_email: z.string().trim().email('Email invalido').max(180),
    requester_name: z.string().trim().max(150).optional().nullable(),
    requester_document_id: z.string().trim().max(80).optional().nullable(),
    target_type: z.enum(DATA_DISPUTE_TARGET_TYPES),
    target_id: z.string().uuid('target_id invalido').optional().nullable(),
    target_reference: z.string().trim().max(250).optional().nullable(),
    dispute_type: z.enum(DATA_DISPUTE_TYPES),
    description: z.string().trim().min(20, 'La descripcion debe tener al menos 20 caracteres').max(2500),
    evidence_url: z.string().trim().url('evidence_url invalida').max(1000).optional().nullable(),
    secure_document_id: z.string().uuid('secure_document_id invalido').optional().nullable(),
  })
  .strict();

const humanReviewRequestCreateSchema = z
  .object({
    requester_email: z.string().trim().email('Email invalido').max(180),
    requester_name: z.string().trim().max(150).optional().nullable(),
    requester_document_id: z.string().trim().max(80).optional().nullable(),
    cedula_consultada: z
      .string()
      .trim()
      .regex(/^\d{5,15}$/, 'cedula_consultada debe contener entre 5 y 15 digitos')
      .optional()
      .nullable(),
    current_score: z.number().int().min(0).max(100).optional().nullable(),
    current_classification: z.string().trim().max(80).optional().nullable(),
    reason: z.enum(HUMAN_REVIEW_REQUEST_REASONS),
    description: z.string().trim().min(20, 'La descripcion debe tener al menos 20 caracteres').max(2500),
    secure_document_ids: z.array(z.string().uuid('secure_document_id invalido')).max(5).optional().default([]),
  })
  .strict();

const adminDataSubjectRequestUpdateSchema = z
  .object({
    status: z.enum(DATA_SUBJECT_REQUEST_STATUSES).optional(),
    admin_notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const adminDataDisputeUpdateSchema = z
  .object({
    status: z.enum(DATA_DISPUTE_STATUSES).optional(),
    admin_notes: z.string().trim().max(2000).optional().nullable(),
    resolution_summary: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const adminHumanReviewRequestUpdateSchema = z
  .object({
    status: z.enum(HUMAN_REVIEW_REQUEST_STATUSES).optional(),
    admin_notes: z.string().trim().max(2000).optional().nullable(),
    review_summary: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const identityVerificationDocumentInputSchema = z.object({
  document_type: z.string().trim().min(2).max(80),
  file_name: z.string().trim().min(1).max(240),
  storage_path: z.string().trim().min(3).max(1000).optional(),
  mime_type: z.string().trim().min(3).max(120),
  file_size: z.number().int().positive().max(25 * 1024 * 1024),
  sha256_hash: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, 'sha256_hash debe tener 64 caracteres hexadecimales')
    .optional()
    .nullable(),
  secure_document_id: z.string().uuid('secure_document_id invalido').optional().nullable(),
});

const identityVerificationRequestSchema = z
  .object({
    document_type: z.string().trim().min(2).max(80),
    document_number: z.string().trim().min(4).max(40),
    full_legal_name: z.string().trim().min(3).max(180),
    phone_number: z.string().trim().min(7).max(25).optional().nullable(),
    legal_declaration_accepted: z.literal(true),
    documents: z.array(identityVerificationDocumentInputSchema).min(1).max(5),
  })
  .strict();

const adminIdentityVerificationUpdateSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.action === 'reject' && !body.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'notes es requerido para rechazar una verificacion de identidad',
        path: ['notes'],
      });
    }
  });

const adminReportReviewSchema = z
  .object({
    action: z.enum(REPORT_REVIEW_ACTIONS),
    notes: z.string().trim().max(2000).optional().nullable(),
    rejection_reason: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.action === 'reject' && !body.rejection_reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'rejection_reason es requerido para rechazar un reporte',
        path: ['rejection_reason'],
      });
    }
  });

const adminReportNoticeSchema = z
  .object({
    action: z.enum(REPORT_NOTICE_ACTIONS),
    subject_email: z.string().trim().email('subject_email invalido').max(180).optional().nullable(),
    notice_channel: z.string().trim().min(2).max(80).optional().nullable(),
    notice_reference: z.string().trim().max(250).optional().nullable(),
    contradiction_summary: z.string().trim().max(2500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      [
        'waive_notice',
        'record_contradiction',
        'mark_contradiction_accepted',
        'mark_contradiction_rejected',
      ].includes(body.action) &&
      !body.notes?.trim() &&
      !body.contradiction_summary?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'notes o contradiction_summary es requerido para esta accion',
        path: ['notes'],
      });
    }
  });

const dataInventoryCreateSchema = z
  .object({
    data_domain: z.enum(DATA_INVENTORY_DOMAINS),
    field_name: z.string().trim().min(2).max(160),
    description: z.string().trim().min(10).max(2000),
    data_category: z.enum(DATA_INVENTORY_CATEGORIES),
    sensitivity_level: z.enum(DATA_INVENTORY_SENSITIVITY_LEVELS),
    source_type: z.enum(DATA_INVENTORY_SOURCE_TYPES),
    legal_basis: z.enum(DATA_INVENTORY_LEGAL_BASES),
    purpose: z.string().trim().min(10).max(2000),
    retention_policy: z.string().trim().min(5).max(2000),
    retention_days: z.number().int().nonnegative().optional().nullable(),
    impacts_scoring: z.boolean().optional().default(false),
    requires_consent: z.boolean().optional().default(true),
    is_public_source: z.boolean().optional().default(false),
    is_active: z.boolean().optional().default(true),
  })
  .strict();

const adminMfaTokenSchema = z
  .object({
    token: z.string().trim().min(6).max(12).optional(),
    backup_code: z.string().trim().min(8).max(32).optional(),
  })
  .refine((value) => Boolean(value.token || value.backup_code), {
    message: 'Codigo MFA requerido',
  });

const dataInventoryUpdateSchema = z
  .object({
    data_domain: z.enum(DATA_INVENTORY_DOMAINS).optional(),
    field_name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
    data_category: z.enum(DATA_INVENTORY_CATEGORIES).optional(),
    sensitivity_level: z.enum(DATA_INVENTORY_SENSITIVITY_LEVELS).optional(),
    source_type: z.enum(DATA_INVENTORY_SOURCE_TYPES).optional(),
    legal_basis: z.enum(DATA_INVENTORY_LEGAL_BASES).optional(),
    purpose: z.string().trim().min(10).max(2000).optional(),
    retention_policy: z.string().trim().min(5).max(2000).optional(),
    retention_days: z.number().int().nonnegative().optional().nullable(),
    impacts_scoring: z.boolean().optional(),
    requires_consent: z.boolean().optional(),
    is_public_source: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

const legalTracePatchSchema = z
  .object({
    data_origin: z.string().trim().max(500).optional().nullable(),
    source_type: z.enum(LEGAL_TRACE_SOURCE_TYPES).optional().nullable(),
    source_name: z.string().trim().max(250).optional().nullable(),
    source_reference: z.string().trim().max(250).optional().nullable(),
    source_url: z.string().trim().url('source_url invalida').max(1000).optional().nullable(),
    legal_basis: z.enum(LEGAL_TRACE_LEGAL_BASES).optional().nullable(),
    public_source_flag: z.boolean().optional().nullable(),
    impacts_scoring: z.boolean().optional().nullable(),
    dispute_status: z.enum(LEGAL_TRACE_DISPUTE_STATUSES).optional().nullable(),
    legal_review_status: z.enum(LEGAL_TRACE_REVIEW_STATUSES).optional().nullable(),
    legal_notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

const reportEvidenceInputSchema = z.object({
  evidence_type: z.enum([
    'lease_contract',
    'payment_proof',
    'chat_or_message',
    'delivery_record',
    'debt_acknowledgement',
    'property_damage',
    'other',
  ]),
  file_name: z.string().trim().min(1).max(240),
  storage_path: z.string().trim().min(3).max(1000).optional(),
  mime_type: z.string().trim().min(3).max(120),
  file_size: z.number().int().positive().max(25 * 1024 * 1024),
  sha256_hash: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, 'sha256_hash debe tener 64 caracteres hexadecimales')
    .optional()
    .nullable(),
  secure_document_id: z.string().uuid('secure_document_id invalido').optional().nullable(),
});

const reportEvidenceBodySchema = z.object({
  legal_declaration_accepted: z.literal(true),
  evidence: z.array(reportEvidenceInputSchema).min(1).max(10),
});

const optionalTextSchema = z.string().trim().max(500, 'MÃ¡ximo 500 caracteres').optional().nullable();

const optionalDateSchema = z
  .string()
  .trim()
  .refine((value) => isValidDateString(value), 'Fecha invÃ¡lida')
  .optional()
  .nullable();

const requiredDateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isValidDateString(value), 'Fecha invÃ¡lida');

const rentalHistoryMetadataSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .default({})
  .superRefine((metadata, ctx) => {
    if (containsSensitiveMetadataKey(metadata)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'metadata no puede contener password, token o secret',
      });
    }
  });

const RENTAL_HISTORY_SUBJECT_TYPES = ['natural_person', 'legal_entity'] as const;
const RENTAL_HISTORY_SUBJECT_DOCUMENT_TYPES = [
  'CC',
  'CE',
  'NIT',
  'PAS',
  'PEP',
  'PPT',
  'TI',
  'OTHER',
] as const;
const RENTAL_HISTORY_PUBLIC_SOURCE_TYPES = ['lessor_reported', 'tenant_self_declared'] as const;

function normalizeRentalHistoryDocumentNumber(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

const rentalHistoryCreateSchema = z
  .object({
    subject_type: z.enum(RENTAL_HISTORY_SUBJECT_TYPES).default('natural_person'),
    subject_document_type: z.enum(RENTAL_HISTORY_SUBJECT_DOCUMENT_TYPES).default('CC'),
    subject_document_number: z.string().trim().min(4).max(30).optional().nullable(),
    source_type: z.enum(RENTAL_HISTORY_PUBLIC_SOURCE_TYPES).default('lessor_reported'),
    cedula_inquilino: z.string().trim().min(4).max(30).optional().nullable(),
    tenant_id: z.string().uuid('tenant_id invÃ¡lido').optional().nullable(),

    lessor_name: z.string().trim().min(1).max(150),
    lessor_contact: z.string().trim().min(1).max(150),
    lessor_document: z.string().trim().max(80).optional().nullable(),

    city: z.string().trim().min(1).max(100),
    property_type: z.string().trim().min(1).max(100),

    contract_start_date: requiredDateSchema,
    contract_end_date: requiredDateSchema,
    contract_duration_months: z.number().int().nonnegative().optional().nullable(),

    monthly_rent_amount: z.number().int().nonnegative(),
    deposit_amount: z.number().int().nonnegative().optional().nullable(),

    had_late_payments: z.boolean(),
    late_payment_months: z.number().int().nonnegative().optional().nullable(),

    had_property_damage: z.boolean(),
    property_damage_notes: optionalTextSchema,

    formal_handover: z.boolean(),
    had_debt_at_handover: z.boolean(),
    debt_amount: z.number().int().nonnegative().optional().nullable(),

    has_supporting_documents: z.boolean(),
    metadata: rentalHistoryMetadataSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (new Date(data.contract_end_date) < new Date(data.contract_start_date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'contract_end_date no puede ser menor que contract_start_date',
        path: ['contract_end_date'],
      });
    }

    const documentNumber = normalizeRentalHistoryDocumentNumber(
      data.subject_document_number || data.cedula_inquilino || ''
    );

    if (!documentNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'subject_document_number es requerido',
        path: ['subject_document_number'],
      });
    } else if (documentNumber.length < 4 || documentNumber.length > 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'subject_document_number debe tener entre 4 y 30 caracteres',
        path: ['subject_document_number'],
      });
    } else if (
      ['CC', 'TI'].includes(data.subject_document_type) &&
      !/^\d+$/.test(documentNumber)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CC y TI deben contener solo numeros',
        path: ['subject_document_number'],
      });
    } else if (data.subject_document_type === 'NIT' && !/^\d+(?:-\d)?$/.test(documentNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'NIT debe contener numeros y un guion opcional',
        path: ['subject_document_number'],
      });
    } else if (
      !['CC', 'TI', 'NIT'].includes(data.subject_document_type) &&
      !/^[A-Z0-9]+$/.test(documentNumber)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'subject_document_number debe ser alfanumerico',
        path: ['subject_document_number'],
      });
    }

    if (data.had_late_payments && data.late_payment_months == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'late_payment_months es requerido si hubo mora',
        path: ['late_payment_months'],
      });
    }

    if (data.had_debt_at_handover && data.debt_amount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'debt_amount es requerido si hubo deuda al entregar',
        path: ['debt_amount'],
      });
    }

    if (data.had_property_damage && !data.property_damage_notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'property_damage_notes es requerido si hubo daÃ±os',
        path: ['property_damage_notes'],
      });
    }
  })
  .transform((data) => {
    const subjectDocumentNumber = normalizeRentalHistoryDocumentNumber(
      data.subject_document_number || data.cedula_inquilino || ''
    );

    return {
      ...data,
      subject_document_number: subjectDocumentNumber,
      cedula_inquilino: data.cedula_inquilino?.trim() || subjectDocumentNumber,
    };
  });

// ================================
// MIDDLEWARES
// ================================

app.use(helmet());

const allowedOrigins = buildAllowedOrigins({
  frontendUrl: PUBLIC_FRONTEND_URL,
  additionalAllowedOrigins: process.env.ADDITIONAL_ALLOWED_ORIGINS,
  requireHttps: process.env.NODE_ENV === 'production',
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isCorsOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }

      console.warn(`❌ CORS bloqueó el origen: ${origin}`);
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

const passwordResetCompleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'No se pudo completar la recuperacion. Intenta nuevamente mas tarde.',
  },
});

const passwordResetCompleteJsonParser = express.json({ limit: '2kb', strict: true });

function parsePasswordResetCompleteBody(req: Request, res: Response, next: NextFunction) {
  passwordResetCompleteJsonParser(req, res, (error?: unknown) => {
    if (error) {
      res.status(400).json({
        success: false,
        message: 'No se pudo completar la recuperacion.',
      });
      return;
    }
    next();
  });
}

app.post(
  '/api/auth/password-reset/complete',
  passwordResetCompleteLimiter,
  parsePasswordResetCompleteBody,
  passwordResetCompleteHandler
);

app.use(express.json({ limit: '1mb' }));

app.post('/api/wompi/webhook', wompiWebhookHandler);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => req.path.startsWith('/api/admin/'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas peticiones desde esta IP',
  },
});

app.use(limiter);

app.use('/api/billing', authenticateToken, billingRouter);
app.use('/api/billing', authenticateToken, wompiBillingRouter);

// ================================
// HELPERS
// ================================

function signToken(user: { id: string; email: string; tipo_usuario: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
    },
    JWT_SECRET as string,
    { expiresIn: '7d' }
  );
}

function isValidCedula(cedula: string): boolean {
  return /^\d{6,10}$/.test(cedula);
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function isValidDateString(value: string): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function calculateCalendarMonthDifference(
  startDateValue: string | null | undefined,
  endDateValue: string | null | undefined
): number | null {
  if (!startDateValue || !endDateValue) {
    return null;
  }

  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return null;
  }

  const monthDifference =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  return Math.max(0, monthDifference);
}

function containsSensitiveMetadataKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveMetadataKey(item));
  }

  return Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) => {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey.includes('password') ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('secret')
    ) {
      return true;
    }

    return containsSensitiveMetadataKey(nestedValue);
  });
}

function getReportRpcErrorType(error: SupabaseRpcErrorLike): 'rate_limit' | 'duplicate' | 'unknown' {
  const fullMessage = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (fullMessage.includes('RATE_LIMIT_EXCEEDED')) {
    return 'rate_limit';
  }

  if (fullMessage.includes('DUPLICATE_REPORT')) {
    return 'duplicate';
  }

  return 'unknown';
}

function isMissingColumnError(error: SupabaseRpcErrorLike | null | undefined): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');

  return code === '42703' || message.includes('column') || message.includes('does not exist');
}

function isDisputedLegalStatus(status: unknown): boolean {
  return status === 'disputed' || status === 'opened' || status === 'under_review';
}

function isPendingLegalReviewStatus(status: unknown): boolean {
  return (
    status === 'pending' ||
    status === 'needs_more_info' ||
    status === 'pending_verification' ||
    status === 'in_review'
  );
}

type AdminReportReviewStatus =
  | 'pendiente'
  | 'aprobado'
  | 'rechazado'
  | 'en_revision'
  | 'needs_more_info';

function getAdminReportReviewStatus(report: {
  estado?: string | null;
  report_verification_status?: string | null;
  legal_review_status?: string | null;
}): AdminReportReviewStatus {
  if (
    report.estado === 'rechazado' ||
    report.report_verification_status === 'rejected' ||
    report.legal_review_status === 'rejected'
  ) {
    return 'rechazado';
  }

  if (
    report.estado === 'aprobado' ||
    report.report_verification_status === 'verified' ||
    report.legal_review_status === 'approved'
  ) {
    return 'aprobado';
  }

  if (
    report.report_verification_status === 'needs_more_info' ||
    report.legal_review_status === 'needs_more_info'
  ) {
    return 'needs_more_info';
  }

  if (report.report_verification_status === 'in_review') {
    return 'en_revision';
  }

  return 'pendiente';
}

function isAdminReportPendingReview(report: {
  estado?: string | null;
  report_verification_status?: string | null;
  legal_review_status?: string | null;
}): boolean {
  const status = getAdminReportReviewStatus(report);
  const reportVerificationStatus = report.report_verification_status || null;
  const legalReviewStatus = report.legal_review_status || null;
  const hasPendingReportVerificationStatus =
    reportVerificationStatus === null ||
    ADMIN_PENDING_REPORT_VERIFICATION_STATUSES.includes(
      reportVerificationStatus as (typeof ADMIN_PENDING_REPORT_VERIFICATION_STATUSES)[number]
    );
  const hasPendingLegalReviewStatus =
    legalReviewStatus === null ||
    ADMIN_PENDING_LEGAL_REVIEW_STATUSES.includes(
      legalReviewStatus as (typeof ADMIN_PENDING_LEGAL_REVIEW_STATUSES)[number]
    );

  return (
    report.estado === 'pendiente' &&
    hasPendingReportVerificationStatus &&
    hasPendingLegalReviewStatus &&
    (status === 'pendiente' || status === 'en_revision' || status === 'needs_more_info')
  );
}

function applyAdminPendingReportsFilter(query: any): any {
  return query
    .eq('estado', 'pendiente')
    .or(
      `report_verification_status.is.null,report_verification_status.in.(${ADMIN_PENDING_REPORT_VERIFICATION_STATUSES.join(',')})`
    )
    .or(
      `legal_review_status.is.null,legal_review_status.in.(${ADMIN_PENDING_LEGAL_REVIEW_STATUSES.join(',')})`
    );
}

function isReportEligibleForScoring(report: Record<string, unknown>): boolean {
  return (
    report.estado === 'aprobado' &&
    report.report_verification_status === 'verified' &&
    report.scoring_eligibility_status === 'eligible' &&
    isNoticeContradictionResolvedForScoring(report)
  );
}

function isNoticeContradictionResolvedForScoring(report: {
  subject_notice_required?: boolean | null;
  subject_notice_status?: SubjectNoticeStatus | string | null;
  contradiction_status?: ContradictionStatus | string | null;
}): boolean {
  if (report.subject_notice_required === false) return true;
  if (report.subject_notice_status === 'waived' || report.subject_notice_status === 'not_required') {
    return true;
  }
  return report.contradiction_status === 'rejected' || report.contradiction_status === 'expired';
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildSearchLegalFlags(params: {
  reports: Array<Record<string, unknown>>;
  legalSignals: Array<Record<string, unknown>>;
}): SearchLegalFlags {
  const disputedReportsCount = params.reports.filter((report) =>
    isDisputedLegalStatus(report.dispute_status)
  ).length;
  const disputedJudicialSignalsCount = params.legalSignals.filter((signal) =>
    isDisputedLegalStatus(signal.dispute_status)
  ).length;
  const pendingLegalReviewCount =
    params.reports.filter((report) => isPendingLegalReviewStatus(report.legal_review_status)).length +
    params.legalSignals.filter((signal) => isPendingLegalReviewStatus(signal.legal_review_status)).length;
  const reportsNotEligibleForScoringCount = params.reports.filter(
    (report) => !isReportEligibleForScoring(report)
  ).length;

  return {
    has_disputed_items: disputedReportsCount + disputedJudicialSignalsCount > 0,
    disputed_reports_count: disputedReportsCount,
    disputed_judicial_signals_count: disputedJudicialSignalsCount,
    has_items_pending_legal_review:
      pendingLegalReviewCount > 0 || reportsNotEligibleForScoringCount > 0,
    pending_legal_review_count: pendingLegalReviewCount,
    has_reports_not_eligible_for_scoring: reportsNotEligibleForScoringCount > 0,
    reports_not_eligible_for_scoring_count: reportsNotEligibleForScoringCount,
  };
}

function buildScoreExplanation(params: {
  score: number | null;
  classification: string | null;
  reports: Array<Record<string, unknown>>;
  legalSignals: Array<Record<string, unknown>>;
  legalFlags: SearchLegalFlags;
}) {
  const factors: ScoreExplanationFactor[] = [];
  const approvedReportsCount = params.reports.length;
  const verifiedJudicialSignalsCount = params.legalSignals.length;
  const legalCautionRequired =
    params.legalFlags.has_disputed_items || params.legalFlags.has_items_pending_legal_review;

  if (approvedReportsCount > 0) {
    factors.push({
      key: 'approved_negative_reports',
      label: 'Reportes aprobados',
      direction: 'negative',
      severity: approvedReportsCount >= 3 ? 'high' : approvedReportsCount >= 2 ? 'medium' : 'low',
      description: `Se encontraron ${approvedReportsCount} reporte(s) aprobado(s) asociado(s) a esta cédula.`,
      impacts_score: true,
      disputed: params.reports.some((report) => isDisputedLegalStatus(report.dispute_status)),
      pending_legal_review: params.reports.some((report) =>
        isPendingLegalReviewStatus(report.legal_review_status)
      ),
    });
  }

  if (verifiedJudicialSignalsCount > 0) {
    factors.push({
      key: 'verified_judicial_signals',
      label: 'Señales judiciales verificadas',
      direction: 'negative',
      severity: 'high',
      description: `Se encontraron ${verifiedJudicialSignalsCount} señal(es) judicial(es) verificada(s) y relevante(s) para riesgo arrendaticio.`,
      impacts_score: true,
      disputed: params.legalSignals.some((signal) => isDisputedLegalStatus(signal.dispute_status)),
      pending_legal_review: params.legalSignals.some((signal) =>
        isPendingLegalReviewStatus(signal.legal_review_status)
      ),
    });
  }

  if (params.legalFlags.has_disputed_items) {
    factors.push({
      key: 'disputed_information',
      label: 'Información en disputa',
      direction: 'neutral',
      severity: 'high',
      description:
        'Hay datos asociados al resultado que han sido marcados como disputados o en revisión de disputa.',
      impacts_score: false,
      disputed: true,
      pending_legal_review: false,
    });
  }

  if (params.legalFlags.has_items_pending_legal_review) {
    factors.push({
      key: 'pending_legal_review',
      label: 'Revisión legal pendiente',
      direction: 'neutral',
      severity: 'medium',
      description:
        'Hay datos asociados al resultado que requieren revisión legal adicional antes de interpretarse como definitivos.',
      impacts_score: false,
      disputed: false,
      pending_legal_review: true,
    });
  }

  if (params.legalFlags.has_reports_not_eligible_for_scoring) {
    factors.push({
      key: 'reports_not_eligible_for_scoring',
      label: 'Reportes no elegibles para score',
      direction: 'neutral',
      severity: 'medium',
      description:
        'Hay reportes asociados que no han sido verificados o no son elegibles para scoring. Se muestran como advertencia y no modifican el score actual.',
      impacts_score: false,
      disputed: false,
      pending_legal_review: true,
    });
  }

  if (approvedReportsCount === 0 && verifiedJudicialSignalsCount === 0) {
    factors.push({
      key: 'no_negative_signals_found',
      label: 'Sin señales negativas verificadas',
      direction: 'positive',
      severity: 'low',
      description:
        'No se encontraron reportes aprobados ni señales judiciales verificadas con impacto en el modelo actual.',
      impacts_score: false,
      disputed: false,
      pending_legal_review: false,
    });
  }

  const summary =
    params.score === null
      ? 'No hay suficiente información para explicar un score calculado de forma confiable.'
      : legalCautionRequired
        ? 'La clasificación se basa en las señales disponibles, pero existen datos en disputa o pendientes de revisión legal.'
        : approvedReportsCount === 0 && verifiedJudicialSignalsCount === 0
          ? 'La clasificación refleja que no se encontraron señales negativas verificadas en las fuentes consultadas.'
          : `La clasificación ${params.classification || 'no disponible'} se deriva de señales verificadas disponibles: reportes aprobados y/o señales judiciales relevantes.`;

  return {
    score: params.score,
    classification: params.classification,
    summary,
    factors,
    legal_caution_required: legalCautionRequired,
    human_review_recommended: legalCautionRequired || params.score === null,
  };
}

function mapScoreClassificationToSpanish(classification: string): string {
  switch (classification) {
    case 'low':
      return 'bajo';
    case 'medium':
      return 'medio';
    case 'high':
      return 'alto';
    case 'critical':
      return 'crítico';
    default:
      return 'alto';
  }
}

function mapScoreClassificationDetailToSpanish(classification: string): string {
  switch (classification) {
    case 'low':
      return 'riesgo_bajo';
    case 'medium':
      return 'riesgo_medio';
    case 'high':
      return 'riesgo_alto';
    case 'critical':
      return 'riesgo_critico';
    default:
      return 'riesgo_alto';
  }
}

function canImpactScore(signal: {
  status?: string;
  dispute_status?: string;
  relevance_for_rental_risk?: boolean;
  score_impact_enabled?: boolean;
}) {
  return (
    signal.status === 'verified' &&
    signal.dispute_status !== 'disputed' &&
    signal.relevance_for_rental_risk === true &&
    signal.score_impact_enabled === true
  );
}

function getEffectiveScoreImpact(signal: {
  status?: string | null;
  dispute_status?: string | null;
  relevance_for_rental_risk?: boolean | null;
  score_impact_enabled?: boolean | null;
}) {
  return (
    signal.status === 'verified' &&
    signal.dispute_status !== 'disputed' &&
    signal.relevance_for_rental_risk === true &&
    signal.score_impact_enabled === true
  );
}

function shouldRecalculateScore(
  previousSignal: {
    status?: string | null;
    dispute_status?: string | null;
    relevance_for_rental_risk?: boolean | null;
    score_impact_enabled?: boolean | null;
  } | null,
  updatedSignal: {
    status?: string | null;
    dispute_status?: string | null;
    relevance_for_rental_risk?: boolean | null;
    score_impact_enabled?: boolean | null;
  }
): boolean {
  if (!previousSignal) {
    return true;
  }

  const previousEffective = getEffectiveScoreImpact(previousSignal);
  const updatedEffective = getEffectiveScoreImpact(updatedSignal);

  if (previousEffective !== updatedEffective) return true;
  if (previousSignal.status !== updatedSignal.status) return true;
  if (previousSignal.dispute_status !== updatedSignal.dispute_status) return true;
  if (previousSignal.score_impact_enabled !== updatedSignal.score_impact_enabled) return true;
  if (previousSignal.relevance_for_rental_risk !== updatedSignal.relevance_for_rental_risk) return true;

  return false;
}

function getRequestIp(req: Request): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0]).split(',')[0].trim();
  }

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || null;
}

function getRequestUserAgent(req: Request): string | null {
  const userAgent = req.headers['user-agent'];

  if (Array.isArray(userAgent) && userAgent.length > 0) {
    return String(userAgent[0]);
  }

  return typeof userAgent === 'string' && userAgent.trim() ? userAgent : null;
}

function getRequestId(req: Request): string | null {
  const requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'];

  if (Array.isArray(requestId) && requestId.length > 0) {
    return String(requestId[0]).trim() || null;
  }

  return typeof requestId === 'string' && requestId.trim() ? requestId.trim() : null;
}

function buildAdminAuditContext(req: AuthRequest) {
  return {
    admin: {
      id: req.user?.id || null,
      email: req.user?.email || null,
    },
    request: {
      ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
      user_agent: getRequestUserAgent(req),
      request_id: getRequestId(req),
    },
  };
}

function buildLegalReportAuditRequest(req: Request) {
  return {
    ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
    user_agent: getRequestUserAgent(req),
    request_id: getRequestId(req),
  };
}

function buildAuthenticationAuditRequest(req: Request) {
  return {
    ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
    user_agent: getRequestUserAgent(req),
    request_id: getRequestId(req),
  };
}

function getRelatedTenantCedula(
  tenants?: { cedula?: string | null } | { cedula?: string | null }[] | null
): string | null {
  const tenant = Array.isArray(tenants) ? tenants[0] : tenants;
  const cedula = String(tenant?.cedula || '').trim();
  return cedula || null;
}

function getOptionalAuthenticatedUser(req: Request): JwtPayload | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET as string) as JwtPayload;
  } catch {
    return null;
  }
}

function calculateDataSubjectRequestDueAt(requestType: DataSubjectRequestType): string {
  const dueAt = new Date();
  // Foundation phase: simple calendar-day approximation. Replace with a Colombian
  // business-day calculator before final legal SLA automation.
  const calendarDays = requestType === 'access' ? 10 : 15;
  dueAt.setDate(dueAt.getDate() + calendarDays);
  return dueAt.toISOString();
}

function calculateDataDisputeDueAt(): string {
  const dueAt = new Date();
  // Foundation phase: simple calendar-day approximation. Replace with a Colombian
  // business-day calculator before final legal SLA automation.
  dueAt.setDate(dueAt.getDate() + 15);
  return dueAt.toISOString();
}

function normalizeNullableText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function buildSafeDocumentMetadata(document: SecureDocumentAccessMetadata) {
  return {
    id: document.id,
    related_entity_type: document.related_entity_type,
    related_entity_id: document.related_entity_id,
    document_category: document.document_category,
    bucket_name: document.bucket_name,
    original_file_name: document.original_file_name,
    mime_type: document.mime_type,
    file_size: document.file_size,
    sha256_hash: document.sha256_hash,
    status: document.status,
    uploaded_at: document.uploaded_at,
    verified_at: document.verified_at,
    rejected_at: document.rejected_at,
    rejection_reason: document.rejection_reason,
    retention_until: document.retention_until,
    legal_hold: document.legal_hold,
    deleted_at: document.deleted_at,
    deletion_reason: document.deletion_reason,
    metadata: document.metadata,
    created_at: document.created_at,
    updated_at: document.updated_at,
  };
}

function buildPublicUrl(pathname: string): string {
  return appendPublicPath(PUBLIC_FRONTEND_URL, pathname);
}

function normalizeRegistrationDocumentType(value: unknown): string {
  const normalized = String(value || 'CC').trim().toUpperCase();
  return normalized ? normalized.slice(0, 20) : 'CC';
}

function normalizeRegistrationDocumentNumber(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s.\-]/g, '');
  return normalized.length >= 4 ? normalized.slice(0, 40) : null;
}

function normalizeRegistrationPhone(value: unknown): string | null {
  const normalized = String(value || '').replace(/\D/g, '');
  return normalized.length >= 7 ? normalized.slice(0, 25) : null;
}

function buildCreditIdentityKey(prefix: string, userId: string, documentType?: string | null, documentNumber?: string | null): string {
  if (documentType && documentNumber) {
    return `${prefix}:document:${documentType}:${documentNumber}`;
  }

  return `${prefix}:user:${userId}`;
}

function getTurnstileTokenFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const rawToken = record.turnstileToken;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  return token || null;
}

async function requireTurnstile(req: Request, res: Response, endpoint: string): Promise<boolean> {
  const ip = getRequestIp(req) || req.socket.remoteAddress || null;
  const result = await verifyTurnstileToken(
    getTurnstileTokenFromBody(req.body),
    ip
  );

  if (result.ok) {
    return true;
  }

  console.warn('[TURNSTILE_VERIFY_FAILED]', {
    endpoint,
    ip,
    reason: result.reason,
  });

  res.status(result.status).json({
    success: false,
    code: result.code,
    message: 'No pudimos validar que eres una persona real. Intenta nuevamente.',
  });
  return false;
}

async function logAccountSecurityEvent(
  req: Request,
  eventType: string,
  userId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await logSecurityEvent(supabase, eventType, {
    ...metadata,
    ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
    user_agent: getRequestUserAgent(req),
    request_id: getRequestId(req),
  }, userId);
}

async function grantAccountSearchCredit(params: {
  req?: Request;
  userId: string;
  creditType: 'registration_bonus' | 'email_verified_bonus' | 'phone_verified_bonus';
  source: string;
  idempotencyKey: string;
  reason: string;
  documentType?: string | null;
  documentNumber?: string | null;
}): Promise<SearchCreditGrantResult> {
  try {
    const { error } = await supabase.from('user_search_credits').insert({
      user_id: params.userId,
      credit_type: params.creditType,
      amount: 1,
      remaining: 1,
      status: 'active',
      source: params.source,
      idempotency_key: params.idempotencyKey,
      reason: params.reason,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        source: params.source,
        idempotency_key: params.idempotencyKey,
        document_type: params.documentType || null,
        document_number: params.documentNumber || null,
      },
    });

    if (error) {
      if (error.code === '23505') {
        if (params.req) {
          await logAccountSecurityEvent(params.req, 'registration_bonus_denied', params.userId, {
            credit_type: params.creditType,
            source: params.source,
            reason: 'duplicate_idempotency_key',
            document_type: params.documentType || null,
            document_number: params.documentNumber || null,
          });
        }
        return { granted: false, reason: 'already_granted' };
      }

      throw error;
    }

    if (params.req) {
      await logAccountSecurityEvent(
        params.req,
        params.creditType === 'registration_bonus'
          ? 'registration_bonus_granted'
          : `${params.creditType}_granted`,
        params.userId,
        {
          credit_type: params.creditType,
          source: params.source,
          document_type: params.documentType || null,
          document_number: params.documentNumber || null,
        }
      );
    }

    return { granted: true, reason: 'granted' };
  } catch (error) {
    console.error('[ACCOUNT_CREDIT_GRANT_ERROR]', {
      user_id: params.userId,
      credit_type: params.creditType,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { granted: false, reason: 'not_applicable' };
  }
}

async function ensureSupabaseAuthUserForPassword(params: {
  userId: string;
  email: string;
  password: string;
  nombre?: string | null;
  emailVerified?: boolean | null;
}): Promise<string | null> {
  const { data: existingById } = await supabase.auth.admin.getUserById(params.userId);
  if (existingById?.user) {
    return existingById.user.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    id: params.userId,
    email: params.email,
    password: params.password,
    email_confirm: Boolean(params.emailVerified),
    user_metadata: {
      nombre: params.nombre || null,
      legacy_public_user_id: params.userId,
    },
  } as Parameters<typeof supabase.auth.admin.createUser>[0]);

  if (error) {
    console.warn('[SUPABASE_AUTH_USER_PROVISION_FAILED]', {
      user_id: params.userId,
      email: params.email,
      error: error.message,
    });
    return null;
  }

  return data.user?.id || null;
}

async function getSupabaseAuthUserForPublicUser(user: {
  id: string;
  email: string;
  auth_user_id?: string | null;
}) {
  const candidateIds = [user.auth_user_id, user.id].filter(Boolean) as string[];

  for (const authUserId of candidateIds) {
    const { data, error } = await supabase.auth.admin.getUserById(authUserId);
    if (!error && data.user) {
      return data.user;
    }
  }

  return null;
}

async function syncEmailVerificationFromSupabase(
  req: Request,
  user: {
    id: string;
    email: string;
    email_verified_at?: string | null;
    email_verificado?: boolean | null;
    auth_user_id?: string | null;
    document_type?: string | null;
    document_number?: string | null;
  }
): Promise<{ email_verified: boolean; email_verified_at: string | null }> {
  const authUser = await getSupabaseAuthUserForPublicUser(user);
  const authVerifiedAt =
    authUser?.email_confirmed_at || authUser?.confirmed_at || null;
  const currentVerifiedAt = user.email_verified_at || null;
  const verifiedAt = currentVerifiedAt || authVerifiedAt;
  const emailVerified = Boolean(verifiedAt || user.email_verificado);

  if (authVerifiedAt && !currentVerifiedAt) {
    const updatePayload: Record<string, unknown> = {
      email_verified_at: authVerifiedAt,
      email_verified: true,
      email_verificado: true,
    };

    if (authUser?.id) {
      updatePayload.auth_user_id = authUser.id;
    }

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', user.id);

    if (error) {
      console.warn('[EMAIL_VERIFICATION_SYNC_FAILED]', {
        user_id: user.id,
        error: error.message,
      });
    } else {
      await grantAccountSearchCredit({
        req,
        userId: user.id,
        creditType: 'email_verified_bonus',
        source: 'email_verification',
        idempotencyKey: buildCreditIdentityKey(
          'email_verified',
          user.id,
          user.document_type || null,
          user.document_number || null
        ),
        reason: 'Bono por correo verificado',
        documentType: user.document_type || null,
        documentNumber: user.document_number || null,
      });
      await logAccountSecurityEvent(req, 'email_verification_confirmed', user.id, {
        email: user.email,
        email_verified_at: authVerifiedAt,
      });
      await logAuthenticationAudit({
        user_id: user.id,
        email: user.email,
        event_type: 'email.verify',
        event_status: 'success',
        request: buildAuthenticationAuditRequest(req),
      });
    }
  }

  return {
    email_verified: emailVerified,
    email_verified_at: verifiedAt,
  };
}

async function getAccountStatus(req: Request, userId: string) {
  const { data: user, error } = await supabase
    .from('users')
    .select(
      'id, email, document_type, document_number, phone_number, phone_verified, phone_verified_at, email_verified, email_verified_at, email_verificado, auth_user_id'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!user) {
    return null;
  }

  const emailState = await syncEmailVerificationFromSupabase(req, {
    id: user.id,
    email: user.email,
    email_verified_at: user.email_verified_at,
    email_verificado: user.email_verificado,
    auth_user_id: user.auth_user_id,
    document_type: user.document_type,
    document_number: user.document_number,
  });

  return {
    email_verified: emailState.email_verified,
    email_verified_at: emailState.email_verified_at,
    phone_verified: Boolean(user.phone_verified),
    phone_verified_at: user.phone_verified_at || null,
    available_credits: await getActiveSearchCreditsCount(userId),
  };
}

function getIdentityVerificationMetadata(document: SecureDocumentAccessMetadata): Record<string, unknown> {
  const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata : {};
  const nested = metadata.identity_verification;

  return nested && typeof nested === 'object'
    ? (nested as Record<string, unknown>)
    : metadata;
}

function getIdentityDocumentReviewStatus(document: SecureDocumentAccessMetadata): 'pending' | 'approved' | 'rejected' {
  const metadata = getIdentityVerificationMetadata(document);
  const reviewStatus = metadata.review_status;

  if (reviewStatus === 'approved' || document.verified_at) {
    return 'approved';
  }

  if (reviewStatus === 'rejected' || document.status === 'rejected' || document.rejected_at) {
    return 'rejected';
  }

  return 'pending';
}

function getIdentityDocumentReview(document: SecureDocumentAccessMetadata): Record<string, unknown> | null {
  const metadata = getIdentityVerificationMetadata(document);
  const reviewStatus = getIdentityDocumentReviewStatus(document);

  if (reviewStatus === 'pending') {
    return null;
  }

  return {
    review_status: reviewStatus,
    reviewed_at: typeof metadata.reviewed_at === 'string'
      ? metadata.reviewed_at
      : document.verified_at || document.rejected_at || null,
    reviewed_by: typeof metadata.reviewed_by === 'string' ? metadata.reviewed_by : null,
    review_notes: typeof metadata.review_notes === 'string' ? metadata.review_notes : document.rejection_reason,
  };
}

function buildIdentityVerificationSecureDocumentResponse(document: SecureDocumentAccessMetadata) {
  const metadata = getIdentityVerificationMetadata(document);
  const rejectedAt = document.rejected_at || null;
  const verifiedAt = document.verified_at || null;
  const verificationStatus = getIdentityDocumentReviewStatus(document);

  return {
    id: document.id,
    secure_document_id: document.id,
    user_id: document.owner_user_id,
    owner_user_id: document.owner_user_id,
    document_type:
      typeof metadata.document_type === 'string'
        ? metadata.document_type
        : document.document_category,
    document_category: document.document_category,
    status: verificationStatus,
    secure_document_status: document.status,
    metadata: {
      identity_verification: metadata,
    },
    file_name: document.original_file_name,
    mime_type: document.mime_type,
    file_size: document.file_size,
    sha256_hash: document.sha256_hash,
    verification_status: verificationStatus,
    uploaded_at: document.uploaded_at || document.created_at,
    reviewed_at:
      typeof metadata.reviewed_at === 'string'
        ? metadata.reviewed_at
        : verifiedAt || rejectedAt,
    reviewed_by: typeof metadata.reviewed_by === 'string' ? metadata.reviewed_by : null,
    admin_notes: document.rejection_reason,
    created_at: document.created_at,
    current_review: getIdentityDocumentReview(document),
  };
}

function buildAdminIdentityVerificationDocumentResponse(
  document: SecureDocumentAccessMetadata,
  user: Record<string, any> | null
) {
  const metadata = getIdentityVerificationMetadata(document);
  const documentResponse = buildIdentityVerificationSecureDocumentResponse(document);

  return {
    ...documentResponse,
    owner_user_id: document.owner_user_id,
    user_id: document.owner_user_id,
    user_email: user?.email || null,
    user_nombre: user?.nombre || null,
    user: user
      ? {
          id: user.id,
          email: user.email,
          nombre: user.nombre || null,
          identity_verification_status: user.identity_verification_status,
          identity_verified_at: user.identity_verified_at,
          identity_verification_method: user.identity_verification_method,
          identity_verification_notes: user.identity_verification_notes,
          reporting_eligibility_status: user.reporting_eligibility_status,
          fecha_registro: user.fecha_registro,
        }
      : null,
    document_type:
      typeof metadata.document_type === 'string'
        ? metadata.document_type
        : document.document_category,
    document_number:
      typeof metadata.document_number === 'string'
        ? metadata.document_number
        : null,
    full_legal_name:
      typeof metadata.full_legal_name === 'string'
        ? metadata.full_legal_name
        : null,
    phone_number:
      typeof metadata.phone_number === 'string'
        ? metadata.phone_number
        : null,
  };
}

async function isCurrentUserAdmin(userId: string, jwtRole?: string | null): Promise<boolean> {
  if (jwtRole !== 'admin') {
    return false;
  }

  const { data: currentUser, error } = await supabase
    .from('users')
    .select('id, tipo_usuario')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return currentUser?.tipo_usuario === 'admin';
}

async function fetchOwnedSecureDocumentsByIds(
  ownerUserId: string,
  documentIds: string[],
  allowedCategories: string[]
): Promise<SecureDocumentAccessMetadata[]> {
  if (documentIds.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(documentIds));
  const { data, error } = await supabase
    .from('secure_documents' as any)
    .select(
      'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
    )
    .eq('owner_user_id', ownerUserId)
    .in('id', uniqueIds)
    .in('document_category', allowedCategories)
    .neq('status', 'deleted');

  if (error) {
    throw error;
  }

  const documents = (data || []) as unknown as SecureDocumentAccessMetadata[];
  if (documents.length !== uniqueIds.length || documents.some((document) => document.status !== 'uploaded')) {
    throw new Error('secure_document_invalid_or_not_uploaded');
  }

  return documents;
}

async function attachSecureDocumentsToEntity(
  documentIds: string[],
  relatedEntityType: string,
  relatedEntityId: string
): Promise<void> {
  if (documentIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('secure_documents' as any)
    .update({
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
    })
    .in('id', Array.from(new Set(documentIds)));

  if (error) {
    throw error;
  }
}

function getDisputeTargetTable(targetType: DataDisputeTargetType): string | null {
  if (targetType === 'report') return 'reports';
  if (targetType === 'judicial_signal') return 'legal_case_signals';
  return null;
}

async function syncTargetDisputeStatus(params: {
  targetType: DataDisputeTargetType;
  targetId: string | null;
  disputeStatus: LegalTraceDisputeStatus;
  legalReviewStatus?: LegalTraceReviewStatus;
  adminUserId?: string | null;
}): Promise<{ targetFound: boolean; updated: boolean }> {
  const table = getDisputeTargetTable(params.targetType);

  if (!table || !params.targetId) {
    return { targetFound: false, updated: false };
  }

  const { data: target, error: targetError } = await supabase
    .from(table)
    .select('id')
    .eq('id', params.targetId)
    .maybeSingle();

  if (targetError) {
    throw targetError;
  }

  if (!target) {
    return { targetFound: false, updated: false };
  }

  const updatePayload: Record<string, unknown> = {
    dispute_status: params.disputeStatus,
  };

  if (params.legalReviewStatus) {
    updatePayload.legal_review_status = params.legalReviewStatus;
  }

  let updateResult = await supabase
    .from(table)
    .update(updatePayload)
    .eq('id', params.targetId);

  if (updateResult.error && params.legalReviewStatus) {
    updateResult = await supabase
      .from(table)
      .update({ dispute_status: params.disputeStatus })
      .eq('id', params.targetId);
  }

  if (updateResult.error) {
    const message = updateResult.error.message || '';
    const code = updateResult.error.code || '';

    if (code === '42703' || message.toLowerCase().includes('dispute_status')) {
      console.warn('[DATA_DISPUTES]', {
        action: 'target_dispute_column_missing',
        target_type: params.targetType,
        target_id: params.targetId,
        admin_user_id: params.adminUserId || null,
      });
      return { targetFound: true, updated: false };
    }

    throw updateResult.error;
  }

  return { targetFound: true, updated: true };
}

function buildLegalTracePayload(
  value: z.infer<typeof legalTracePatchSchema>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (value.data_origin !== undefined) {
    payload.data_origin = normalizeNullableText(value.data_origin, 500);
  }

  if (value.source_type !== undefined) {
    payload.source_type = value.source_type || null;
  }

  if (value.source_name !== undefined) {
    payload.source_name = normalizeNullableText(value.source_name, 250);
  }

  if (value.source_reference !== undefined) {
    payload.source_reference = normalizeNullableText(value.source_reference, 250);
  }

  if (value.source_url !== undefined) {
    payload.source_url = normalizeNullableText(value.source_url, 1000);
  }

  if (value.legal_basis !== undefined) {
    payload.legal_basis = value.legal_basis || null;
  }

  if (value.public_source_flag !== undefined) {
    payload.public_source_flag = value.public_source_flag;
  }

  if (value.impacts_scoring !== undefined) {
    payload.impacts_scoring = value.impacts_scoring;
  }

  if (value.dispute_status !== undefined) {
    payload.dispute_status = value.dispute_status || 'none';
  }

  if (value.legal_review_status !== undefined) {
    payload.legal_review_status = value.legal_review_status || 'pending';
  }

  if (value.legal_notes !== undefined) {
    payload.legal_notes = normalizeNullableText(value.legal_notes, 2000);
  }

  return payload;
}

function getStartOfDayISO(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function getCurrentCalendarMonthRangeISO(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function getTodaySearchCount(userId: string): Promise<number> {
  const startOfDayISO = getStartOfDayISO();

  const { count, error } = await supabase
    .from('search_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDayISO);

  if (error) {
    throw new Error(`Error contando búsquedas del día: ${error.message}`);
  }

  const searchLogCount = count ?? 0;
  const { count: bonusCreditSearchCount, error: bonusCreditError } = await supabase
    .from('user_search_credits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'used')
    .gte('used_at', startOfDayISO)
    .not('used_for_search_log_id', 'is', null);

  if (bonusCreditError) {
    console.error('[SEARCH_CREDIT_DAILY_COUNT_ERROR]', bonusCreditError);
    return searchLogCount;
  }

  return Math.max(0, searchLogCount - (bonusCreditSearchCount ?? 0));
}

async function getActiveSearchCreditsCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_search_credits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('remaining', 0)
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[SEARCH_CREDIT_COUNT_ERROR]', error);
    return 0;
  }

  return count ?? 0;
}

async function getNextActiveSearchCredit(userId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('user_search_credits')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('remaining', 0)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .order('granted_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[SEARCH_CREDIT_LOOKUP_ERROR]', error);
    return null;
  }

  return data;
}

async function grantRentalHistoryVerifiedSearchCredit(params: {
  userId: string;
  rentalHistoryId: string;
  adminUserId: string;
}): Promise<SearchCreditGrantResult> {
  try {
    const monthRange = getCurrentCalendarMonthRangeISO();
    const { count, error: countError } = await supabase
      .from('user_search_credits')
      .select('id', { count: 'exact', head: true })
      .eq('credit_type', 'rental_history_verified')
      .eq('user_id', params.userId)
      .gte('granted_at', monthRange.start)
      .lt('granted_at', monthRange.end);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) >= 5) {
      console.warn('[SEARCH_CREDIT_MONTHLY_LIMIT_REACHED]', {
        user_id: params.userId,
        rental_history_id: params.rentalHistoryId,
      });
      return { granted: false, reason: 'monthly_limit_reached' };
    }

    const { error: insertError } = await supabase.from('user_search_credits').insert({
      user_id: params.userId,
      rental_history_id: params.rentalHistoryId,
      credit_type: 'rental_history_verified',
      amount: 1,
      remaining: 1,
      status: 'active',
      reason: 'Historial arrendaticio verificado',
      granted_by_admin_id: params.adminUserId,
      metadata: {
        source: 'rental_history_verification',
      },
    });

    if (insertError) {
      if (insertError.code === '23505') {
        console.warn('[SEARCH_CREDIT_ALREADY_GRANTED]', {
          user_id: params.userId,
          rental_history_id: params.rentalHistoryId,
        });
        return { granted: false, reason: 'already_granted' };
      }

      throw insertError;
    }

    return { granted: true, reason: 'granted' };
  } catch (error) {
    console.error('[SEARCH_CREDIT_GRANT_ERROR]', error);
    return { granted: false, reason: 'not_applicable' };
  }
}

async function getUserSearchPlan(
  userId: string,
  tipoUsuario: string
): Promise<{
  plan_type: string;
  daily_search_limit: number | null;
}> {
  if (tipoUsuario === 'admin') {
    return {
      plan_type: 'admin',
      daily_search_limit: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('plan_type, daily_search_limit')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return {
        plan_type: 'free',
        daily_search_limit: 3,
      };
    }

    const planType =
      typeof data.plan_type === 'string' && data.plan_type.trim() ? data.plan_type : 'free';
    const rawDailyLimit = data.daily_search_limit;

    if (rawDailyLimit === null) {
      if (planType !== 'free') {
        return {
          plan_type: planType,
          daily_search_limit: null,
        };
      }

      return {
        plan_type: 'free',
        daily_search_limit: 3,
      };
    }

    if (!Number.isInteger(rawDailyLimit) || rawDailyLimit < 0) {
      return {
        plan_type: 'free',
        daily_search_limit: 3,
      };
    }

    return {
      plan_type: planType,
      daily_search_limit: rawDailyLimit,
    };
  } catch (error) {
    console.error('[search_limit] Error obteniendo plan del usuario:', error);
    return {
      plan_type: 'free',
      daily_search_limit: 3,
    };
  }
}

async function getSearchLimitInfo(user: {
  id: string;
  tipo_usuario: string;
}): Promise<{
  plan_type: string;
  daily_limit: number | null;
  used_searches: number;
  remaining_searches: number | null;
  bonus_credits_available: number | null;
  bonus_credit_used: boolean;
}> {
  const searchPlan = await getUserSearchPlan(user.id, user.tipo_usuario);

  try {
    const usedSearches = await getTodaySearchCount(user.id);
    const bonusCreditsAvailable =
      user.tipo_usuario === 'admin' ? null : await getActiveSearchCreditsCount(user.id);

    return {
      plan_type: searchPlan.plan_type,
      daily_limit: searchPlan.daily_search_limit,
      used_searches: usedSearches,
      remaining_searches:
        searchPlan.daily_search_limit === null
          ? null
          : Math.max(0, searchPlan.daily_search_limit - usedSearches),
      bonus_credits_available: bonusCreditsAvailable,
      bonus_credit_used: false,
    };
  } catch (error) {
    console.error('[search_limit] Error obteniendo información de límite:', error);
    return {
      plan_type: searchPlan.plan_type,
      daily_limit: searchPlan.daily_search_limit,
      used_searches: 0,
      remaining_searches:
        searchPlan.daily_search_limit === null ? null : searchPlan.daily_search_limit,
      bonus_credits_available: user.tipo_usuario === 'admin' ? null : 0,
      bonus_credit_used: false,
    };
  }
}

function getRentalHistoryAccessLevel(planType: string | null | undefined): 'none' | 'summary' | 'full' {
  if (planType === 'pro' || planType === 'admin') return 'full';
  if (planType === 'basic') return 'summary';
  return 'none';
}

function buildRentalHistorySummary(histories: SearchRentalHistoryRow[]) {
  const durationValues = histories
    .map((history) =>
      history.contract_duration_months ??
      calculateCalendarMonthDifference(history.contract_start_date, history.contract_end_date)
    )
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const rentValues = histories
    .map((history) => history.monthly_rent_amount)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const average = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

  return {
    total_verified: histories.length,
    average_duration_months: average(durationValues),
    average_monthly_rent_amount: average(rentValues),
    formal_handover_count: histories.filter((history) => history.formal_handover === true).length,
    late_payment_count: histories.filter((history) => history.had_late_payments === true).length,
    property_damage_count: histories.filter((history) => history.had_property_damage === true).length,
    supporting_documents_count: histories.filter((history) => history.has_supporting_documents === true).length,
  };
}

function buildRentalHistorySearchPayload(histories: SearchRentalHistoryRow[], planType: string | null | undefined) {
  const accessLevel = getRentalHistoryAccessLevel(planType);
  const fullSummary = buildRentalHistorySummary(histories);

  if (accessLevel === 'none') {
    return {
      rental_history_summary: { total_verified: fullSummary.total_verified },
      rental_histories: [],
      rental_history_locked: fullSummary.total_verified > 0,
      rental_history_detail_level: 'none',
      rental_history_message:
        fullSummary.total_verified === 0 ? 'No se encontró historial' : null,
    };
  }

  return {
    rental_history_summary: fullSummary,
    rental_histories: accessLevel === 'full' ? histories.slice(0, 10) : [],
    rental_history_locked: false,
    rental_history_detail_level: accessLevel,
    rental_history_message:
      fullSummary.total_verified === 0 ? 'No se encontró historial' : null,
  };
}

async function insertSearchLog(payload: SearchLogInsert): Promise<string | null> {
  const { data, error } = await supabase
    .from('search_logs')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Error guardando search_log: ${error.message}`);
  }

  return data?.id ?? null;
}

function normalizeSearchDocumentForAudit(document: string): string {
  return document.replace(/\D/g, '').slice(0, 40);
}

function getSearchAuditDocumentValue(value: unknown): string {
  if (typeof value === 'string') return value.trim().slice(0, 80);
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return '[array]';
  return '[non_string]';
}

function getSearchAuditCreditBalance(limitInfo: SearchLimitDecision['limitInfo']): number | null {
  if (limitInfo.remaining_searches === null) return null;

  const remainingSearches = Math.max(0, limitInfo.remaining_searches ?? 0);
  const bonusCredits =
    typeof limitInfo.bonus_credits_available === 'number'
      ? Math.max(0, limitInfo.bonus_credits_available)
      : 0;

  return remainingSearches + bonusCredits;
}

function getSafeAuditErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code.slice(0, 80);
  }

  return error instanceof Error ? error.name.slice(0, 80) : 'UNKNOWN_ERROR';
}

function getSafeAuditErrorMessage(error: unknown, fallback = 'Error interno del servidor'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return fallback;
}

async function insertSearchAuditLog(payload: SearchAuditLogInsert): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('search_audit_logs')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    console.log('[SEARCH_AUDIT_LOGGED]', {
      audit_id: data?.id ?? null,
      user_id: payload.user_id,
      tenant_id: payload.tenant_id,
      search_status: payload.search_status,
      result_status: payload.result_status,
      http_status: payload.http_status,
      request_id: payload.request_id,
    });
  } catch (error) {
    console.error('[SEARCH_AUDIT_FAILED]', {
      user_id: payload.user_id,
      tenant_id: payload.tenant_id,
      search_status: payload.search_status,
      result_status: payload.result_status,
      http_status: payload.http_status,
      request_id: payload.request_id,
      error_code: getSafeAuditErrorCode(error),
      error_message: getSafeAuditErrorMessage(error, 'No se pudo registrar auditoria de busqueda'),
    });
  }
}

async function consumeSearchCredit(creditId: string, searchLogId: string | null): Promise<void> {
  const { data: credit, error: creditError } = await supabase
    .from('user_search_credits')
    .select('remaining')
    .eq('id', creditId)
    .eq('status', 'active')
    .gt('remaining', 0)
    .maybeSingle();

  if (creditError) {
    console.error('[SEARCH_CREDIT_CONSUME_ERROR]', creditError);
    return;
  }

  if (!credit || typeof credit.remaining !== 'number' || credit.remaining <= 0) {
    return;
  }

  const nowISO = new Date().toISOString();
  const nextRemaining = Math.max(0, credit.remaining - 1);
  const updatePayload: Record<string, unknown> = {
    remaining: nextRemaining,
    status: nextRemaining === 0 ? 'used' : 'active',
    updated_at: nowISO,
  };

  if (nextRemaining === 0) {
    updatePayload.used_at = nowISO;
  }

  if (searchLogId && nextRemaining === 0) {
    updatePayload.used_for_search_log_id = searchLogId;
  }

  const { error } = await supabase
    .from('user_search_credits')
    .update(updatePayload)
    .eq('id', creditId)
    .eq('status', 'active')
    .gt('remaining', 0);

  if (error) {
    console.error('[SEARCH_CREDIT_CONSUME_ERROR]', error);
  }
}

async function assertSearchLimit(
  req: AuthRequest,
  res: Response,
  auditContext?: SearchAuditRequestContext
): Promise<SearchLimitDecision> {
  const blockedDecision: SearchLimitDecision = {
    allowed: false,
    bonusCreditId: null,
    limitInfo: {
      plan_type: 'free',
      daily_limit: 3,
      used_searches: 0,
      remaining_searches: 0,
      bonus_credits_available: 0,
      bonus_credit_used: false,
    },
  };

  if (!req.user) {
    return blockedDecision;
  }

  try {
    const searchPlan = await getUserSearchPlan(req.user.id, req.user.tipo_usuario);
    const todaySearchCount = await getTodaySearchCount(req.user.id);
    const bonusCreditsAvailable =
      req.user.tipo_usuario === 'admin' ? null : await getActiveSearchCreditsCount(req.user.id);
    const baseLimitInfo = {
      plan_type: searchPlan.plan_type,
      daily_limit: searchPlan.daily_search_limit,
      used_searches: todaySearchCount,
      remaining_searches:
        searchPlan.daily_search_limit === null
          ? null
          : Math.max(0, searchPlan.daily_search_limit - todaySearchCount),
      bonus_credits_available: bonusCreditsAvailable,
      bonus_credit_used: false,
    };

    if (searchPlan.daily_search_limit === null) {
      return {
        allowed: true,
        limitInfo: baseLimitInfo,
        bonusCreditId: null,
      };
    }

    if (todaySearchCount >= searchPlan.daily_search_limit) {
      const bonusCredit = req.user.tipo_usuario === 'admin'
        ? null
        : await getNextActiveSearchCredit(req.user.id);

      if (bonusCredit) {
        return {
          allowed: true,
          limitInfo: {
            ...baseLimitInfo,
            bonus_credit_used: true,
          },
          bonusCreditId: bonusCredit.id,
        };
      }

      if (auditContext) {
        await insertSearchAuditLog({
          tenant_id: null,
          user_id: req.user.id,
          searched_document: auditContext.searchedDocument,
          normalized_document: auditContext.normalizedDocument,
          search_status: 'blocked_no_credits',
          result_status: null,
          http_status: 429,
          credits_before: getSearchAuditCreditBalance(baseLimitInfo),
          credits_after: getSearchAuditCreditBalance({
            ...baseLimitInfo,
            remaining_searches: 0,
            bonus_credits_available: bonusCreditsAvailable,
          }),
          plan_code: searchPlan.plan_type,
          used_extra_credit: false,
          ip_address: auditContext.requestIp,
          user_agent: auditContext.requestUserAgent,
          request_id: auditContext.requestId,
          error_code: 'SEARCH_LIMIT_REACHED',
          error_message: 'Has alcanzado el limite diario de busquedas',
          metadata: {
            daily_limit: searchPlan.daily_search_limit,
            used_searches: todaySearchCount,
            remaining_searches: 0,
            bonus_credits_available: bonusCreditsAvailable,
          },
        });
      }

      res.status(429).json({
        success: false,
        message: 'Has alcanzado el límite diario de búsquedas',
        limit: searchPlan.daily_search_limit,
        daily_limit: searchPlan.daily_search_limit,
        used_searches: todaySearchCount,
        remaining_searches: 0,
        bonus_credits_available: bonusCreditsAvailable,
        bonus_credit_used: false,
        plan_type: searchPlan.plan_type,
      });
      return blockedDecision;
    }

    return {
      allowed: true,
      limitInfo: baseLimitInfo,
      bonusCreditId: null,
    };
  } catch (error) {
    console.error('[search_limit] Error validando límite diario:', error);
    if (auditContext) {
      await insertSearchAuditLog({
        tenant_id: null,
        user_id: req.user?.id || null,
        searched_document: auditContext.searchedDocument,
        normalized_document: auditContext.normalizedDocument,
        search_status: 'internal_error',
        result_status: null,
        http_status: 500,
        credits_before: null,
        credits_after: null,
        plan_code: null,
        used_extra_credit: false,
        ip_address: auditContext.requestIp,
        user_agent: auditContext.requestUserAgent,
        request_id: auditContext.requestId,
        error_code: getSafeAuditErrorCode(error),
        error_message: getSafeAuditErrorMessage(error),
        metadata: {
          phase: 'search_limit',
        },
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
    return blockedDecision;
  }
}

// ================================
// AUTH MIDDLEWARE
// ================================

function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token no proporcionado',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({
      success: false,
      message: 'Token inválido',
    });
  }
}

function sendIdentityVerificationRequired(res: Response): void {
  res.status(403).json({
    success: false,
    code: 'IDENTITY_VERIFICATION_REQUIRED',
    message: 'Debes verificar tu identidad antes de reportar o aportar historial.',
  });
}

async function fetchIdentityGateUser(userId: string): Promise<IdentityGateRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, identity_verification_status, reporting_eligibility_status')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as IdentityGateRow | null) || null;
}

async function requireVerifiedIdentityForSensitiveContribution(
  req: AuthRequest,
  res: Response,
  context: 'report' | 'rental_history'
): Promise<IdentityGateRow | null> {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Usuario no autenticado',
    });
    return null;
  }

  const identityUser = await fetchIdentityGateUser(userId);
  const verified = identityUser?.identity_verification_status === 'verified';
  const reportingAllowed =
    context === 'report' ? identityUser?.reporting_eligibility_status === 'allowed' : true;

  if (!verified || !reportingAllowed) {
    console.warn('[IDENTITY_VERIFICATION]', {
      action: `${context}_blocked`,
      user_id: userId,
      identity_verification_status: identityUser?.identity_verification_status || null,
      reporting_eligibility_status: identityUser?.reporting_eligibility_status || null,
    });
    sendIdentityVerificationRequired(res);
    return null;
  }

  return identityUser;
}

async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const jwtUserId = req.user?.id || null;
  const jwtEmail = req.user?.email || null;

  if (!jwtUserId) {
    console.warn('[ADMIN_ROLE_REVALIDATION_FAILED]', {
      user_id: null,
      email: jwtEmail,
      reason: 'missing_user_id',
    });
    res.status(403).json({
      success: false,
      message: 'Acceso denegado',
    });
    return;
  }

  try {
    const { data: currentUser, error } = await supabase
      .from('users')
      .select('id, email, tipo_usuario')
      .eq('id', jwtUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!currentUser || currentUser.tipo_usuario !== 'admin') {
      console.warn('[ADMIN_ROLE_REVALIDATION_FAILED]', {
        user_id: jwtUserId,
        email: currentUser?.email || jwtEmail,
        reason: currentUser ? 'not_admin' : 'user_not_found',
      });
      res.status(403).json({
        success: false,
        message: 'Acceso denegado',
      });
      return;
    }

    next();
  } catch (error) {
    console.warn('[ADMIN_ROLE_REVALIDATION_FAILED]', {
      user_id: jwtUserId,
      email: jwtEmail,
      reason: 'db_error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'Error validando permisos administrativos',
    });
  }
}

function isRecentMfaValid(lastVerifiedAt: string | null | undefined): boolean {
  if (!lastVerifiedAt) return false;
  const verifiedAt = Date.parse(lastVerifiedAt);
  if (!Number.isFinite(verifiedAt)) return false;
  return Date.now() - verifiedAt <= 15 * 60 * 1000;
}

async function getAdminMfaState(userId: string): Promise<{
  id: string;
  email: string | null;
  tipo_usuario: string;
  mfa_enabled: boolean | null;
  mfa_secret_encrypted: string | null;
  mfa_last_verified_at: string | null;
  mfa_backup_codes_hash: BackupCodeHash[] | null;
} | null> {
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, email, tipo_usuario, mfa_enabled, mfa_secret_encrypted, mfa_last_verified_at, mfa_backup_codes_hash'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as {
    id: string;
    email: string | null;
    tipo_usuario: string;
    mfa_enabled: boolean | null;
    mfa_secret_encrypted: string | null;
    mfa_last_verified_at: string | null;
    mfa_backup_codes_hash: BackupCodeHash[] | null;
  } | null);
}

async function requireRecentAdminMfa(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const adminUserId = req.user?.id || null;

  if (!adminUserId) {
    res.status(403).json({
      success: false,
      error: 'MFA verification required',
      code: 'MFA_REQUIRED',
    });
    return;
  }

  try {
    const mfaState = await getAdminMfaState(adminUserId);
    const mfaEnabled = Boolean(mfaState?.mfa_enabled);
    const recentMfaValid = isRecentMfaValid(mfaState?.mfa_last_verified_at);

    if (!mfaEnabled || !recentMfaValid) {
      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: 'critical_action_blocked_mfa_required',
        severity: 'high',
        target: {
          type: 'admin_action',
          reference: req.originalUrl || req.path,
        },
        new_state: {
          mfa_enabled: mfaEnabled,
          recent_mfa_valid: recentMfaValid,
          method: req.method,
        },
        reason: 'MFA verification required for critical admin action',
      });

      res.status(403).json({
        success: false,
        error: 'MFA verification required',
        code: 'MFA_REQUIRED',
      });
      return;
    }

    next();
  } catch (error) {
    console.warn('[ADMIN_MFA_REVALIDATION_FAILED]', {
      user_id: adminUserId,
      email: req.user?.email || null,
      reason: 'db_error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'Error validando MFA administrativo',
    });
  }
}

async function verifyAdminMfaCredential(params: {
  user: {
    mfa_secret_encrypted: string | null;
    mfa_backup_codes_hash: BackupCodeHash[] | null;
  };
  token?: string;
  backupCode?: string;
}): Promise<{ valid: boolean; usedBackupCode: boolean; backupCodeIndex: number | null }> {
  if (params.token) {
    if (!params.user.mfa_secret_encrypted) {
      return { valid: false, usedBackupCode: false, backupCodeIndex: null };
    }

    const secret = decryptMfaSecret(params.user.mfa_secret_encrypted);
    return {
      valid: verifyTotpToken(secret, params.token),
      usedBackupCode: false,
      backupCodeIndex: null,
    };
  }

  if (params.backupCode) {
    const result = await verifyBackupCode(params.backupCode, params.user.mfa_backup_codes_hash);
    return {
      valid: result.valid,
      usedBackupCode: result.valid,
      backupCodeIndex: result.index,
    };
  }

  return { valid: false, usedBackupCode: false, backupCodeIndex: null };
}

// ================================
// HEALTH
// ================================

app.post('/api/documents/upload-intent', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const parsed = secureDocumentUploadIntentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      console.warn('[SECURE_DOCUMENT_UPLOAD_INTENT]', {
        user_id: req.user.id,
        category: req.body?.document_category || null,
        bucket: null,
        mime_type: req.body?.mime_type || null,
        file_size: req.body?.file_size || null,
        result: 'validation_error',
      });
      res.status(400).json({
        success: false,
        message: 'Metadata documental invalida',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const document = await createDocumentUploadIntent({
      ownerUserId: req.user.id,
      relatedEntityType: parsed.data.related_entity_type,
      relatedEntityId: parsed.data.related_entity_id || null,
      documentCategory: parsed.data.document_category,
      originalFileName: parsed.data.original_file_name,
      mimeType: parsed.data.mime_type,
      fileSize: parsed.data.file_size,
      sha256Hash: parsed.data.sha256_hash || null,
      metadata: parsed.data.metadata || {},
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.tipo_usuario,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    const signedUpload = await createSignedUpload(
      document.id,
      document.bucket_name,
      document.storage_path
    );

    console.log('[SECURE_DOCUMENT_UPLOAD_INTENT]', {
      user_id: req.user.id,
      category: document.document_category,
      bucket: document.bucket_name,
      mime_type: document.mime_type,
      file_size: document.file_size,
      result: 'created',
    });

    res.status(201).json({
      success: true,
      document_id: document.id,
      bucket_name: document.bucket_name,
      storage_path: document.storage_path,
      signed_upload: {
        path: signedUpload.path,
        token: signedUpload.token,
        signed_url: signedUpload.signedUrl,
      },
      expires_in_seconds: SIGNED_UPLOAD_EXPIRES_IN_SECONDS,
    });
  } catch (error) {
    const errorLike = error as { message?: string; code?: string };
    console.error('[SECURE_DOCUMENT_UPLOAD_INTENT]', {
      user_id: req.user?.id || null,
      category: req.body?.document_category || null,
      bucket: null,
      mime_type: req.body?.mime_type || null,
      file_size: req.body?.file_size || null,
      result: 'error',
      error_code: errorLike?.code || null,
      error_message: errorLike?.message || 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'Error interno creando la intencion documental',
    });
  }
});

app.get('/api/documents/:id/access', authenticateToken, async (req: AuthRequest, res: Response) => {
  const documentId = req.params.id;

  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const documentIdValidation = z.string().uuid().safeParse(documentId);
    if (!documentIdValidation.success) {
      res.status(400).json({
        success: false,
        message: 'document_id invalido',
      });
      return;
    }

    const { data, error } = await supabase
      .from('secure_documents' as any)
      .select(
        [
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
        ].join(', ')
      )
      .eq('id', documentIdValidation.data)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const document = data as unknown as SecureDocumentAccessMetadata | null;

    if (!document) {
      await logDocumentAccess({
        documentId: documentIdValidation.data,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'view_requested',
        accessResult: 'denied',
        reason: 'document_not_found',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(404).json({
        success: false,
        message: 'Documento no encontrado',
      });
      return;
    }

    const isAdmin = await isCurrentUserAdmin(req.user.id, req.user.tipo_usuario);
    const isOwner = document.owner_user_id === req.user.id;
    if (!isOwner && !isAdmin) {
      await logDocumentAccess({
        documentId: document.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'view_requested',
        accessResult: 'denied',
        reason: 'not_owner_or_admin',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(403).json({
        success: false,
        message: 'Acceso denegado',
      });
      return;
    }

    await logDocumentAccess({
      documentId: document.id,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.tipo_usuario,
      actionType: 'view_requested',
      accessResult: 'allowed',
      reason: 'metadata_access_phase_1',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    res.json({
      success: true,
      document: buildSafeDocumentMetadata(document),
      message: 'Metadata segura del documento. No se emiten URLs publicas.',
    });
  } catch (error) {
    console.error('Error consultando metadata documental segura:', error);
    try {
      await logDocumentAccess({
        documentId,
        actorUserId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        actorRole: req.user?.tipo_usuario || null,
        actionType: 'view_requested',
        accessResult: 'failed',
        reason: 'internal_error',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });
    } catch {
      // Access logging failure must not leak internals to the client.
    }

    res.status(500).json({
      success: false,
      message: 'Error interno consultando el documento',
    });
  }
});

app.post('/api/documents/:id/confirm-upload', authenticateToken, async (req: AuthRequest, res: Response) => {
  const documentId = req.params.id;

  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const documentIdValidation = z.string().uuid().safeParse(documentId);
    if (!documentIdValidation.success) {
      res.status(400).json({
        success: false,
        message: 'document_id invalido',
      });
      return;
    }

    const { data, error } = await supabase
      .from('secure_documents' as any)
      .select(
        [
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
        ].join(', ')
      )
      .eq('id', documentIdValidation.data)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const document = data as unknown as SecureDocumentAccessMetadata | null;

    if (!document) {
      await logDocumentAccess({
        documentId: documentIdValidation.data,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'upload_confirmed',
        accessResult: 'denied',
        reason: 'document_not_found',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(404).json({
        success: false,
        message: 'Documento no encontrado',
      });
      return;
    }

    const isAdmin = await isCurrentUserAdmin(req.user.id, req.user.tipo_usuario);
    const isOwner = document.owner_user_id === req.user.id;

    if (!isOwner && !isAdmin) {
      await logDocumentAccess({
        documentId: document.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'upload_confirmed',
        accessResult: 'denied',
        reason: 'not_owner_or_admin',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(403).json({
        success: false,
        message: 'Acceso denegado',
      });
      return;
    }

    if (document.status !== 'pending_upload') {
      console.warn('[SECURE_DOCUMENT_CONFIRM_UPLOAD]', {
        document_id: document.id,
        user_id: req.user.id,
        bucket: document.bucket_name,
        result: 'not_pending_upload',
        storage_error_message: null,
      });
      res.status(409).json({
        success: false,
        message: 'El documento no esta pendiente de carga',
      });
      return;
    }

    const objectExists = await verifyObjectExists(document.bucket_name, document.storage_path);
    if (!objectExists) {
      const storageInfo = await supabase.storage
        .from(document.bucket_name)
        .info(document.storage_path)
        .catch((storageError) => ({ data: null, error: storageError }));
      const storageErrorMessage =
        storageInfo.error instanceof Error
          ? storageInfo.error.message
          : storageInfo.error?.message || 'storage_object_not_found';

      await logDocumentAccess({
        documentId: document.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'upload_confirmed',
        accessResult: 'failed',
        reason: 'storage_object_not_found',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      console.warn('[SECURE_DOCUMENT_CONFIRM_UPLOAD]', {
        document_id: document.id,
        user_id: req.user.id,
        bucket: document.bucket_name,
        result: 'storage_object_not_found',
        storage_error_message: storageErrorMessage,
      });

      res.status(409).json({
        success: false,
        message: 'El archivo aun no existe en storage privado',
      });
      return;
    }

    const updatedDocument = await confirmDocumentUpload({
      documentId: document.id,
      ownerUserId: req.user.id,
      allowAdmin: isAdmin,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.tipo_usuario,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    if (!updatedDocument) {
      console.warn('[SECURE_DOCUMENT_CONFIRM_UPLOAD]', {
        document_id: document.id,
        user_id: req.user.id,
        bucket: document.bucket_name,
        result: 'update_not_applied',
        storage_error_message: null,
      });
      res.status(409).json({
        success: false,
        message: 'No se pudo confirmar la carga del documento',
      });
      return;
    }

    console.log('[SECURE_DOCUMENT_CONFIRM_UPLOAD]', {
      document_id: document.id,
      user_id: req.user.id,
      bucket: document.bucket_name,
      result: 'confirmed',
      storage_error_message: null,
    });

    res.json({
      success: true,
      document: buildSafeDocumentMetadata(updatedDocument),
    });
  } catch (error) {
    const errorLike = error as { message?: string; code?: string };
    console.error('[SECURE_DOCUMENT_CONFIRM_UPLOAD]', {
      document_id: documentId,
      user_id: req.user?.id || null,
      bucket: null,
      result: 'error',
      storage_error_message: errorLike?.message || 'unknown',
      error_code: errorLike?.code || null,
    });
    res.status(500).json({
      success: false,
      message: 'Error interno confirmando la carga documental',
    });
  }
});

app.get('/api/documents/:id/signed-read', authenticateToken, async (req: AuthRequest, res: Response) => {
  const documentId = req.params.id;

  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const documentIdValidation = z.string().uuid().safeParse(documentId);
    if (!documentIdValidation.success) {
      res.status(400).json({
        success: false,
        message: 'document_id invalido',
      });
      return;
    }

    const { data, error } = await supabase
      .from('secure_documents' as any)
      .select(
        'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
      )
      .eq('id', documentIdValidation.data)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const document = data as unknown as SecureDocumentAccessMetadata | null;

    if (!document) {
      await logDocumentAccess({
        documentId: documentIdValidation.data,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'signed_url_issued',
        accessResult: 'denied',
        reason: 'document_not_found',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(404).json({
        success: false,
        message: 'Documento no encontrado',
      });
      return;
    }

    const isAdmin = await isCurrentUserAdmin(req.user.id, req.user.tipo_usuario);
    const isOwner = document.owner_user_id === req.user.id;

    if (!isOwner && !isAdmin) {
      await logDocumentAccess({
        documentId: document.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'signed_url_issued',
        accessResult: 'denied',
        reason: 'not_owner_or_admin',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(403).json({
        success: false,
        message: 'Acceso denegado',
      });
      return;
    }

    if (document.status === 'deleted' || document.deleted_at) {
      await logDocumentAccess({
        documentId: document.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'signed_url_issued',
        accessResult: 'denied',
        reason: 'document_deleted',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(410).json({
        success: false,
        message: 'Documento eliminado',
      });
      return;
    }

    if (document.status === 'quarantined') {
      await logDocumentAccess({
        documentId: document.id,
        actorUserId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.tipo_usuario,
        actionType: 'signed_url_issued',
        accessResult: 'denied',
        reason: 'document_quarantined',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      res.status(423).json({
        success: false,
        message: 'Documento en cuarentena',
      });
      return;
    }

    const signedRead = await createSignedReadUrl({
      documentId: document.id,
      bucketName: document.bucket_name,
      storagePath: document.storage_path,
      actorUserId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.tipo_usuario,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    res.json({
      success: true,
      expires_in_seconds: SIGNED_READ_EXPIRES_IN_SECONDS,
      signed_url: signedRead.signedUrl,
    });
  } catch (error) {
    console.error('Error creando signed read documental seguro:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno creando acceso temporal al documento',
    });
  }
});

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      status: 'OK',
      message: 'InmoScore API conectada a Supabase',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      status: 'ERROR',
      message: 'Error conectando a Supabase',
      detail: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
});

// ================================
// LEGAL COMPLIANCE ROUTES
// ================================

app.get('/api/legal/documents/active', async (_req: Request, res: Response) => {
  try {
    const documents = await getActiveLegalDocuments();

    res.json({
      success: true,
      documents: documents.map((document) => ({
        document_type: document.document_type,
        version: document.version,
        effective_date: document.effective_date,
        title: document.title,
      })),
    });
  } catch (error) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'list_active_documents',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudieron cargar los documentos legales activos',
    });
  }
});

app.post('/api/legal/acceptances', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const parsed = legalAcceptancesBodySchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos legales invalidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const body = parsed.data;
    const acceptances = body.acceptances?.length
      ? body.acceptances
      : [
          {
            document_type: body.document_type as LegalDocumentType,
            document_version: body.document_version as string,
            acceptance_method: body.acceptance_method,
            consent_purposes: body.consent_purposes,
          },
        ];

    const nowISO = new Date().toISOString();
    const ipAddress = getRequestIp(req) || req.socket.remoteAddress || null;
    const userAgent = getRequestUserAgent(req);
    const registered = [];

    for (const acceptance of acceptances) {
      if (!isValidLegalDocumentType(acceptance.document_type)) {
        res.status(400).json({
          success: false,
          message: 'Tipo de documento legal invalido',
        });
        return;
      }

      const registeredAcceptance = await registerLegalAcceptance({
        userId: req.user.id,
        documentType: acceptance.document_type,
        documentVersion: acceptance.document_version,
        acceptanceMethod: acceptance.acceptance_method || 'checkbox',
        consentPurposes: acceptance.consent_purposes,
        acceptedAt: nowISO,
        ipAddress,
        userAgent,
        marketingConsent: body.marketing_consent,
      });

      registered.push({
        id: registeredAcceptance.id,
        document_type: registeredAcceptance.document_type,
        document_version: registeredAcceptance.document_version,
        accepted_at: registeredAcceptance.accepted_at,
        acceptance_method: registeredAcceptance.acceptance_method,
        consent_purposes: registeredAcceptance.consent_purposes,
      });
    }

    res.status(201).json({
      success: true,
      acceptances: registered,
    });
  } catch (error) {
    console.error('[LEGAL_COMPLIANCE]', {
      action: 'create_acceptance',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(400).json({
      success: false,
      message: 'No se pudo registrar la aceptacion legal',
    });
  }
});

app.post('/api/legal/data-requests', async (req: Request, res: Response) => {
  try {
    const parsed = dataSubjectRequestCreateSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos de solicitud invalidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const optionalUser = getOptionalAuthenticatedUser(req);
    const submittedAt = new Date().toISOString();
    const dueAt = calculateDataSubjectRequestDueAt(parsed.data.request_type);

    const { data, error } = await supabase
      .from('data_subject_requests')
      .insert({
        user_id: optionalUser?.id || null,
        requester_email: parsed.data.requester_email.toLowerCase(),
        requester_name: normalizeNullableText(parsed.data.requester_name, 150),
        requester_document_id: normalizeNullableText(parsed.data.requester_document_id, 80),
        request_type: parsed.data.request_type,
        status: 'received',
        description: parsed.data.description,
        submitted_at: submittedAt,
        due_at: dueAt,
        ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
        user_agent: getRequestUserAgent(req),
      })
      .select('id, status, submitted_at, due_at')
      .single();

    if (error || !data) {
      throw error || new Error('No se pudo crear la solicitud');
    }

    console.log('[DATA_SUBJECT_REQUESTS]', {
      action: 'created',
      request_id: data.id,
      request_type: parsed.data.request_type,
      authenticated: Boolean(optionalUser?.id),
    });

    res.status(201).json({
      success: true,
      request: data,
    });
  } catch (error) {
    console.error('[DATA_SUBJECT_REQUESTS]', {
      action: 'create_error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo registrar la solicitud',
    });
  }
});

app.get('/api/legal/data-requests/my', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const { data, error } = await supabase
      .from('data_subject_requests')
      .select(
        'id, requester_email, requester_name, request_type, status, description, submitted_at, due_at, resolved_at, created_at, updated_at'
      )
      .or(`user_id.eq.${req.user.id},requester_email.eq.${req.user.email.toLowerCase()}`)
      .order('submitted_at', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      requests: data || [],
    });
  } catch (error) {
    console.error('[DATA_SUBJECT_REQUESTS]', {
      action: 'my_list_error',
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudieron cargar las solicitudes',
    });
  }
});

app.post('/api/legal/disputes', async (req: Request, res: Response) => {
  try {
    const parsed = dataDisputeCreateSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos de disputa invalidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const optionalUser = getOptionalAuthenticatedUser(req);
    const body = parsed.data;
    const requesterEmail = body.requester_email.toLowerCase();
    const submittedAt = new Date().toISOString();
    const dueAt = calculateDataDisputeDueAt();
    const targetId = body.target_id || null;
    const targetReference = normalizeNullableText(body.target_reference, 250);
    const disputeSecureDocumentIds = body.secure_document_id ? [body.secure_document_id] : [];

    if (disputeSecureDocumentIds.length > 0 && !optionalUser?.id) {
      res.status(401).json({
        success: false,
        message: 'Debes iniciar sesion para adjuntar documentos privados',
      });
      return;
    }

    if (optionalUser?.id && disputeSecureDocumentIds.length > 0) {
      await fetchOwnedSecureDocumentsByIds(optionalUser.id, disputeSecureDocumentIds, [
        'dispute_evidence',
      ]);
    }

    let existingQuery = supabase
      .from('data_disputes')
      .select('id, status, submitted_at, due_at')
      .eq('requester_email', requesterEmail)
      .eq('target_type', body.target_type)
      .eq('dispute_type', body.dispute_type)
      .in('status', ['received', 'in_review', 'awaiting_user_info', 'accepted'])
      .order('submitted_at', { ascending: false })
      .limit(1);

    if (targetId) {
      existingQuery = existingQuery.eq('target_id', targetId);
    } else if (targetReference) {
      existingQuery = existingQuery.eq('target_reference', targetReference);
    }

    const { data: existingDisputes, error: existingError } = await existingQuery;

    if (existingError) {
      throw existingError;
    }

    const existingDispute = existingDisputes?.[0];

    if (existingDispute) {
      res.status(200).json({
        success: true,
        dispute: existingDispute,
        idempotent: true,
      });
      return;
    }

    const targetSync = await syncTargetDisputeStatus({
      targetType: body.target_type,
      targetId,
      disputeStatus: 'disputed',
    });

    const { data, error } = await supabase
      .from('data_disputes')
      .insert({
        user_id: optionalUser?.id || null,
        requester_email: requesterEmail,
        requester_name: normalizeNullableText(body.requester_name, 150),
        requester_document_id: normalizeNullableText(body.requester_document_id, 80),
        target_type: body.target_type,
        target_id: targetId,
        target_reference: targetReference,
        dispute_type: body.dispute_type,
        status: 'received',
        description: body.description,
        evidence_url: normalizeNullableText(body.evidence_url, 1000),
        submitted_at: submittedAt,
        due_at: dueAt,
        ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
        user_agent: getRequestUserAgent(req),
      })
      .select('id, status, submitted_at, due_at')
      .single();

    if (error || !data) {
      throw error || new Error('No se pudo crear la disputa');
    }

    if (disputeSecureDocumentIds.length > 0) {
      await attachSecureDocumentsToEntity(disputeSecureDocumentIds, 'data_dispute', data.id);
    }

    console.log('[DATA_DISPUTES]', {
      action: 'created',
      dispute_id: data.id,
      target_type: body.target_type,
      target_found: targetSync.targetFound,
      target_marked: targetSync.updated,
      authenticated: Boolean(optionalUser?.id),
    });

    res.status(201).json({
      success: true,
      dispute: data,
    });
  } catch (error) {
    console.error('[DATA_DISPUTES]', {
      action: 'create_error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo registrar la disputa',
    });
  }
});

app.get('/api/legal/disputes/my', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const { data, error } = await supabase
      .from('data_disputes')
      .select(DATA_DISPUTE_SELECT_COLUMNS.join(', '))
      .or(`user_id.eq.${req.user.id},requester_email.eq.${req.user.email.toLowerCase()}`)
      .order('submitted_at', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      disputes: (data || []) as unknown as DataDisputeRow[],
    });
  } catch (error) {
    console.error('[DATA_DISPUTES]', {
      action: 'my_list_error',
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudieron cargar las disputas',
    });
  }
});

app.post('/api/legal/human-review-requests', async (req: Request, res: Response) => {
  try {
    const parsed = humanReviewRequestCreateSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos de solicitud invalidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const optionalUser = getOptionalAuthenticatedUser(req);
    const body = parsed.data;
    const humanReviewSecureDocumentIds = body.secure_document_ids || [];

    if (humanReviewSecureDocumentIds.length > 0 && !optionalUser?.id) {
      res.status(401).json({
        success: false,
        message: 'Debes iniciar sesion para adjuntar documentos privados',
      });
      return;
    }

    if (optionalUser?.id && humanReviewSecureDocumentIds.length > 0) {
      await fetchOwnedSecureDocumentsByIds(optionalUser.id, humanReviewSecureDocumentIds, [
        'human_review_evidence',
      ]);
    }

    const { data, error } = await supabase
      .from('human_review_requests')
      .insert({
        user_id: optionalUser?.id || null,
        requester_email: body.requester_email.toLowerCase(),
        requester_name: normalizeNullableText(body.requester_name, 150),
        requester_document_id: normalizeNullableText(body.requester_document_id, 80),
        cedula_consultada: normalizeNullableText(body.cedula_consultada, 15),
        current_score: body.current_score ?? null,
        current_classification: normalizeNullableText(body.current_classification, 80),
        reason: body.reason,
        description: body.description,
        status: 'received',
        ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
        user_agent: getRequestUserAgent(req),
      })
      .select('id, status, created_at')
      .single();

    if (error || !data) {
      throw error || new Error('No se pudo crear la solicitud de revision humana');
    }

    if (humanReviewSecureDocumentIds.length > 0) {
      await attachSecureDocumentsToEntity(
        humanReviewSecureDocumentIds,
        'human_review_request',
        data.id
      );
    }

    console.log('[HUMAN_REVIEW_REQUESTS]', {
      action: 'created',
      request_id: data.id,
      reason: body.reason,
      authenticated: Boolean(optionalUser?.id),
    });

    res.status(201).json({
      success: true,
      request: data,
    });
  } catch (error) {
    console.error('[HUMAN_REVIEW_REQUESTS]', {
      action: 'create_error',
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo registrar la solicitud de revision humana',
    });
  }
});

app.get('/api/legal/human-review-requests/my', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const { data, error } = await supabase
      .from('human_review_requests')
      .select(HUMAN_REVIEW_REQUEST_SELECT_COLUMNS.join(', '))
      .or(`user_id.eq.${req.user.id},requester_email.eq.${req.user.email.toLowerCase()}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      requests: (data || []) as unknown as HumanReviewRequestRow[],
    });
  } catch (error) {
    console.error('[HUMAN_REVIEW_REQUESTS]', {
      action: 'my_list_error',
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudieron cargar las solicitudes de revision humana',
    });
  }
});

app.post('/api/legal/identity-verification/request', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const parsed = identityVerificationRequestSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      console.warn('[IDENTITY_VERIFICATION_REQUEST]', {
        user_id: req.user.id,
        has_secure_document_id: Array.isArray(req.body?.documents)
          ? req.body.documents.some((document: { secure_document_id?: unknown }) =>
              Boolean(document?.secure_document_id)
            )
          : false,
        secure_document_id: Array.isArray(req.body?.documents)
          ? req.body.documents.find((document: { secure_document_id?: unknown }) =>
              Boolean(document?.secure_document_id)
            )?.secure_document_id || null
          : null,
        document_type: req.body?.document_type || null,
        document_number_present: Boolean(req.body?.document_number),
        error_code: 'validation_error',
        error_message: parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
      });
      res.status(400).json({
        success: false,
        message: 'Datos de verificacion invalidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const body = parsed.data;
    const nowISO = new Date().toISOString();
    const cleanDocumentNumber = body.document_number.replace(/\s+/g, '').toUpperCase();
    const identitySecureDocumentIds = body.documents
      .map((document) => document.secure_document_id)
      .filter((documentId): documentId is string => Boolean(documentId));

    console.log('[IDENTITY_VERIFICATION_REQUEST]', {
      user_id: req.user.id,
      has_secure_document_id: identitySecureDocumentIds.length > 0,
      secure_document_id: identitySecureDocumentIds[0] || null,
      document_type: body.document_type,
      document_number_present: Boolean(cleanDocumentNumber),
      error_code: null,
      error_message: 'request_received',
    });

    if (identitySecureDocumentIds.length === 0) {
      console.warn('[IDENTITY_VERIFICATION_SECURE_DOCUMENT]', {
        user_id: req.user.id,
        secure_document_id: null,
        document_found: false,
        status: null,
        category: null,
        owner_match: false,
      });
      res.status(400).json({
        success: false,
        message: 'secure_document_id es requerido para la verificacion de identidad',
      });
      return;
    }

    const uniqueIdentitySecureDocumentIds = Array.from(new Set(identitySecureDocumentIds));
    const { data: secureDocumentRows, error: secureDocumentReadError } = await supabase
      .from('secure_documents' as any)
      .select(
        'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
      )
      .in('id', uniqueIdentitySecureDocumentIds);

    if (secureDocumentReadError) {
      throw secureDocumentReadError;
    }

    const identitySecureDocuments = (secureDocumentRows || []) as unknown as SecureDocumentAccessMetadata[];
    const identitySecureDocumentById = identitySecureDocuments.reduce<Record<string, SecureDocumentAccessMetadata>>(
      (acc, document) => {
        acc[document.id] = document;
        return acc;
      },
      {}
    );

    for (const secureDocumentId of uniqueIdentitySecureDocumentIds) {
      const document = identitySecureDocumentById[secureDocumentId] || null;
      console.log('[IDENTITY_VERIFICATION_SECURE_DOCUMENT]', {
        user_id: req.user.id,
        secure_document_id: secureDocumentId,
        document_found: Boolean(document),
        status: document?.status || null,
        category: document?.document_category || null,
        owner_match: document?.owner_user_id === req.user.id,
      });
    }

    const hasInvalidSecureDocument =
      identitySecureDocuments.length !== uniqueIdentitySecureDocumentIds.length ||
      identitySecureDocuments.some(
        (document) =>
          document.owner_user_id !== req.user!.id ||
          document.document_category !== 'identity_document' ||
          document.status !== 'uploaded'
      );

    if (hasInvalidSecureDocument) {
      res.status(400).json({
        success: false,
        message: 'Documento seguro invalido o no confirmado',
      });
      return;
    }

    if (identitySecureDocuments.length > 0) {
      console.log('[IDENTITY_VERIFICATION_DB]', {
        table: 'secure_documents',
        operation: 'update_identity_metadata',
        document_number_present: Boolean(cleanDocumentNumber),
      });

      for (const secureDocument of identitySecureDocuments) {
        const currentMetadata =
          secureDocument.metadata && typeof secureDocument.metadata === 'object'
            ? secureDocument.metadata
            : {};

        const { error: secureDocumentMetadataError } = await supabase
          .from('secure_documents' as any)
          .update({
            metadata: {
              ...currentMetadata,
              identity_verification: {
                document_type: body.document_type,
                document_number: cleanDocumentNumber,
                full_legal_name: body.full_legal_name,
                phone_number: normalizeNullableText(body.phone_number, 25),
                legal_declaration_accepted: true,
                identity_verification_submitted_at: nowISO,
              },
            },
          })
          .eq('id', secureDocument.id)
          .eq('owner_user_id', req.user.id);

        if (secureDocumentMetadataError) {
          throw secureDocumentMetadataError;
        }
      }
    }

    console.log('[IDENTITY_VERIFICATION_DB]', {
      table: 'users',
      operation: 'update_identity_status',
      document_number_present: Boolean(cleanDocumentNumber),
    });

    const { data: user, error: userError } = await supabase
      .from('users')
      .update({
        identity_verification_status: 'pending_review',
        identity_verification_method: 'document_metadata_upload_with_legal_declaration',
        identity_verification_notes:
          'Declaracion legal de identidad veraz aceptada por el usuario.',
        reporting_eligibility_status: 'not_allowed',
      })
      .eq('id', req.user.id)
      .select(IDENTITY_VERIFICATION_USER_SELECT_COLUMNS.join(', '))
      .single();

    if (userError || !user) {
      throw userError || new Error('No se pudo actualizar el usuario');
    }

    if (identitySecureDocumentIds.length > 0) {
      await attachSecureDocumentsToEntity(identitySecureDocumentIds, 'identity_verification', req.user.id);
    }

    console.log('[IDENTITY_VERIFICATION_REQUEST]', {
      action: 'requested',
      user_id: req.user.id,
      has_secure_document_id: identitySecureDocumentIds.length > 0,
      secure_document_id: identitySecureDocumentIds[0] || null,
      document_type: body.document_type,
      document_number_present: Boolean(cleanDocumentNumber),
      document_count: identitySecureDocuments.length,
      declaration_accepted: true,
      error_code: null,
      error_message: null,
    });

    res.status(201).json({
      success: true,
      identity: {
        ...((user as unknown) as Record<string, unknown>),
        document_type: body.document_type,
        document_number: cleanDocumentNumber,
        full_legal_name: body.full_legal_name,
        phone_number: normalizeNullableText(body.phone_number, 25),
      },
      documents: identitySecureDocuments.map(buildIdentityVerificationSecureDocumentResponse),
    });
  } catch (error) {
    const errorLike = error as { message?: string; code?: string };
    const requestDocuments = Array.isArray(req.body?.documents) ? req.body.documents : [];
    const firstSecureDocumentId =
      requestDocuments.find((document: { secure_document_id?: unknown }) =>
        Boolean(document?.secure_document_id)
      )?.secure_document_id || null;

    console.error('[IDENTITY_VERIFICATION_REQUEST]', {
      action: 'request_error',
      user_id: req.user?.id || null,
      has_secure_document_id: Boolean(firstSecureDocumentId),
      secure_document_id: firstSecureDocumentId,
      document_type: req.body?.document_type || null,
      document_number_present: Boolean(req.body?.document_number),
      error_code: errorLike?.code || null,
      error_message: errorLike?.message || 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo registrar la verificacion de identidad',
    });
  }
});

app.get('/api/legal/identity-verification/my', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select(IDENTITY_VERIFICATION_USER_SELECT_COLUMNS.join(', '))
      .eq('id', req.user.id)
      .single();

    if (userError || !user) {
      throw userError || new Error('Usuario no encontrado');
    }

    const { data: documents, error: documentsError } = await supabase
      .from('secure_documents' as any)
      .select(
        'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
      )
      .eq('owner_user_id', req.user.id)
      .eq('document_category', 'identity_document')
      .eq('related_entity_type', 'identity_verification')
      .neq('status', 'deleted')
      .order('uploaded_at', { ascending: false })
      .limit(25);

    if (documentsError) {
      throw documentsError;
    }

    const identityDocuments = ((documents || []) as unknown as SecureDocumentAccessMetadata[]).map(
      buildIdentityVerificationSecureDocumentResponse
    );
    const latestIdentityDocument = ((documents || []) as unknown as SecureDocumentAccessMetadata[])[0] || null;
    const latestIdentityMetadata = latestIdentityDocument
      ? getIdentityVerificationMetadata(latestIdentityDocument)
      : {};

    res.json({
      success: true,
      identity: {
        ...((user as unknown) as Record<string, unknown>),
        document_type:
          typeof latestIdentityMetadata.document_type === 'string'
            ? latestIdentityMetadata.document_type
            : null,
        document_number:
          typeof latestIdentityMetadata.document_number === 'string'
            ? latestIdentityMetadata.document_number
            : null,
        full_legal_name:
          typeof latestIdentityMetadata.full_legal_name === 'string'
            ? latestIdentityMetadata.full_legal_name
            : null,
        phone_number:
          typeof latestIdentityMetadata.phone_number === 'string'
            ? latestIdentityMetadata.phone_number
            : null,
      },
      documents: identityDocuments,
      reporting_eligibility_status:
        ((user as unknown) as Record<string, unknown>).reporting_eligibility_status || 'not_allowed',
    });
  } catch (error) {
    console.error('[IDENTITY_VERIFICATION]', {
      action: 'my_status_error',
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo cargar el estado de verificacion',
    });
  }
});

// ================================
// AUTH ROUTES
// ================================

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    if (!(await requireTurnstile(req, res, '/api/auth/register'))) {
      return;
    }

    const parsed = registerSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const nombre = String(parsed.data.nombre || parsed.data.fullName || '').trim();
    const email = String(parsed.data.email).trim().toLowerCase();
    const password = String(parsed.data.password);
    const documentType = normalizeRegistrationDocumentType(parsed.data.document_type);
    const documentNumber = normalizeRegistrationDocumentNumber(
      parsed.data.document_number || parsed.data.cedula
    );
    const phoneNumber = normalizeRegistrationPhone(parsed.data.phone);
    const requestIp = getRequestIp(req) || req.socket.remoteAddress || null;
    const requestUserAgent = getRequestUserAgent(req);
    const requestedTipoUsuario =
      typeof parsed.data.tipo_usuario === 'string' ? parsed.data.tipo_usuario.trim() : '';
    const requestedTipoUsuarioNormalized = requestedTipoUsuario.toLowerCase();
    const tipo_usuario = 'propietario';
    const plan_type = 'free';
    const daily_search_limit = 3;

    if (!documentNumber) {
      res.status(400).json({
        success: false,
        code: 'DOCUMENT_REQUIRED',
        message: 'La cedula es requerida',
      });
      return;
    }

    if (requestedTipoUsuario && requestedTipoUsuarioNormalized !== tipo_usuario) {
      console.warn('[AUTH_REGISTER_ROLE_BLOCKED]', {
        email,
        requested_tipo_usuario: requestedTipoUsuario.slice(0, 80),
        forced_tipo_usuario: tipo_usuario,
        ip_address: requestIp,
        request_id: getRequestId(req),
      });

      await logAccountSecurityEvent(req, 'suspicious_registration_attempt', null, {
        email,
        reason: 'role_override_attempt',
        requested_tipo_usuario: requestedTipoUsuario.slice(0, 80),
      });

      await logAdminAction({
        admin: null,
        action_type: 'auth_register_role_override_attempt',
        severity: 'high',
        target: {
          type: 'auth_registration',
          reference: email,
        },
        previous_state: {
          requested_tipo_usuario: requestedTipoUsuario.slice(0, 80),
        },
        new_state: {
          forced_tipo_usuario: tipo_usuario,
          plan_type,
          daily_search_limit,
        },
        reason: 'Public registration role override attempt blocked',
        request: {
          ip_address: requestIp,
          user_agent: requestUserAgent,
          request_id: getRequestId(req),
        },
      });
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingUserError) {
      console.error('Error verificando usuario existente:', existingUserError);
      res.status(500).json({
        success: false,
        message: 'Error verificando usuario existente',
      });
      return;
    }

    if (existingUser) {
      await logAccountSecurityEvent(req, 'duplicate_email_attempt', existingUser.id, {
        email,
        document_type: documentType,
        document_number: documentNumber,
      });
      res.status(409).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'Este correo ya está registrado.',
      });
      return;
    }

    const { data: existingDocumentUser, error: existingDocumentError } = await supabase
      .from('users')
      .select('id, email, document_type, document_number')
      .eq('document_type', documentType)
      .eq('document_number', documentNumber)
      .maybeSingle();

    if (existingDocumentError) {
      console.error('[AUTH_REGISTER_DOCUMENT_LOOKUP_ERROR]', {
        error: existingDocumentError.message,
        document_type: documentType,
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo validar el documento',
      });
      return;
    }

    if (existingDocumentUser) {
      await logAccountSecurityEvent(req, 'duplicate_document_attempt', existingDocumentUser.id, {
        email,
        document_type: documentType,
        document_number: documentNumber,
      });
      res.status(409).json({
        success: false,
        code: 'DUPLICATE_DOCUMENT',
        message: 'Esta cédula ya está asociada a una cuenta.',
      });
      return;
    }

    if (phoneNumber) {
      const phoneWindowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existingPhoneUser, error: existingPhoneError } = await supabase
        .from('users')
        .select('id, email, phone_number, fecha_registro')
        .eq('phone_number', phoneNumber)
        .gte('fecha_registro', phoneWindowStart)
        .maybeSingle();

      if (existingPhoneError) {
        console.error('[AUTH_REGISTER_PHONE_LOOKUP_ERROR]', {
          error: existingPhoneError.message,
        });
        res.status(500).json({
          success: false,
          message: 'No se pudo validar el telefono',
        });
        return;
      }

      if (existingPhoneUser) {
        await logAccountSecurityEvent(req, 'duplicate_phone_attempt', existingPhoneUser.id, {
          email,
          phone_number: phoneNumber,
          document_type: documentType,
          document_number: documentNumber,
        });
        await logAccountSecurityEvent(req, 'suspicious_registration_attempt', existingPhoneUser.id, {
          email,
          reason: 'recent_duplicate_phone',
          phone_number: phoneNumber,
          document_type: documentType,
          document_number: documentNumber,
        });
        res.status(409).json({
          success: false,
          code: 'DUPLICATE_PHONE',
          message: 'Este teléfono ya fue usado recientemente.',
        });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const registrationCreditKey = buildCreditIdentityKey(
      'registration',
      'pending',
      documentType,
      documentNumber
    );

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        nombre,
        email,
        password: hashedPassword,
        tipo_usuario,
        plan_type,
        daily_search_limit,
        document_type: documentType,
        document_number: documentNumber,
        phone_number: phoneNumber,
        registration_ip_address: requestIp,
        registration_user_agent: requestUserAgent,
        fecha_registro: new Date().toISOString(),
        email_verified: false,
        email_verificado: false,
      })
      .select('id, nombre, email, tipo_usuario, plan_type, daily_search_limit')
      .single();

    if (insertError || !newUser) {
      console.error('Error creando usuario:', insertError);
      res.status(500).json({
        success: false,
        message: 'No se pudo crear el usuario',
      });
      return;
    }

    const authUserId = await ensureSupabaseAuthUserForPassword({
      userId: newUser.id,
      email: newUser.email,
      password,
      nombre: newUser.nombre,
      emailVerified: false,
    });

    if (authUserId) {
      const { error: authLinkError } = await supabase
        .from('users')
        .update({ auth_user_id: authUserId })
        .eq('id', newUser.id);

      if (authLinkError) {
        console.warn('[AUTH_REGISTER_AUTH_LINK_FAILED]', {
          user_id: newUser.id,
          error: authLinkError.message,
        });
      }

      const { error: verificationEmailError } = await supabase.auth.resend({
        type: 'signup',
        email: newUser.email,
        options: {
          emailRedirectTo: buildPublicUrl('/configuracion'),
        },
      });

      if (verificationEmailError) {
        console.warn('[AUTH_REGISTER_VERIFICATION_EMAIL_FAILED]', {
          user_id: newUser.id,
          error: verificationEmailError.message,
        });
      } else {
        await logAccountSecurityEvent(req, 'email_verification_resent', newUser.id, {
          email: newUser.email,
          source: 'registration',
        });
      }
    }

    await grantAccountSearchCredit({
      req,
      userId: newUser.id,
      creditType: 'registration_bonus',
      source: 'registration',
      idempotencyKey: registrationCreditKey,
      reason: 'Credito por registro de cuenta',
      documentType,
      documentNumber,
    });

    await logAccountSecurityEvent(req, 'account_registered', newUser.id, {
      email: newUser.email,
      document_type: documentType,
      document_number: documentNumber,
      phone_number: phoneNumber,
      supabase_auth_user_id: authUserId,
    });

    if (parsed.data.legal_acceptances?.length) {
      const acceptedAt = new Date().toISOString();
      const ipAddress = getRequestIp(req) || req.socket.remoteAddress || null;
      const userAgent = getRequestUserAgent(req);

      try {
        for (const acceptance of parsed.data.legal_acceptances) {
          await registerLegalAcceptance({
            userId: newUser.id,
            documentType: acceptance.document_type,
            documentVersion: acceptance.document_version,
            acceptanceMethod: acceptance.acceptance_method || 'registration_checkbox',
            consentPurposes: acceptance.consent_purposes,
            acceptedAt,
            ipAddress,
            userAgent,
            marketingConsent: parsed.data.marketing_consent,
          });
        }
      } catch (legalError) {
        console.error('[LEGAL_COMPLIANCE]', {
          action: 'register_user_acceptances',
          user_id: newUser.id,
          error: legalError instanceof Error ? legalError.message : 'unknown',
        });
        res.status(500).json({
          success: false,
          message: 'No se pudo registrar la aceptacion legal',
        });
        return;
      }
    }

    const token = signToken({
      id: newUser.id,
      email: newUser.email,
      tipo_usuario: newUser.tipo_usuario,
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado correctamente. Revisa tu correo para verificar la cuenta.',
      token,
      user: {
        id: newUser.id,
        nombre: newUser.nombre,
        fullName: newUser.nombre,
        email: newUser.email,
        tipo_usuario: newUser.tipo_usuario,
        plan_type: newUser.plan_type,
        daily_search_limit: newUser.daily_search_limit,
        email_verified: false,
        email_verified_at: null,
        phone_verified: false,
        phone_verified_at: null,
        bonus_credits_available: await getActiveSearchCreditsCount(newUser.id),
      },
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar usuario',
    });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    if (!(await requireTurnstile(req, res, '/api/auth/login'))) {
      await logAuthenticationAudit({
        email:
          typeof (req.body as { email?: unknown } | null)?.email === 'string'
            ? String((req.body as { email?: unknown }).email).trim().toLowerCase()
            : null,
        event_type: 'login.failed',
        event_status: 'failed',
        failure_reason: 'turnstile_failed',
        request: buildAuthenticationAuditRequest(req),
      });
      return;
    }

    const parsed = loginSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      await logAuthenticationAudit({
        email:
          typeof (req.body as { email?: unknown } | null)?.email === 'string'
            ? String((req.body as { email?: unknown }).email).trim().toLowerCase()
            : null,
        event_type: 'login.failed',
        event_status: 'failed',
        failure_reason: 'invalid_payload',
        request: buildAuthenticationAuditRequest(req),
      });
      res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos',
      });
      return;
    }

    const cleanEmail = String(parsed.data.email).trim().toLowerCase();
    const plainPassword = String(parsed.data.password);
    const requestId = getRequestId(req);

    console.info('[AUTH_LOGIN_DEBUG]', {
      action: 'login_attempt',
      email: cleanEmail,
      endpoint: '/api/auth/login',
      request_id: requestId,
    });

    let { data: user, error } = await supabase
      .from('users')
      .select('id, nombre, email, password, tipo_usuario, plan_type, daily_search_limit, email_verified, email_verified_at, email_verificado, phone_verified, phone_verified_at, auth_user_id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (!error && !user) {
      const { data: legacyEmailMatches, error: legacyEmailError } = await supabase
        .from('users')
        .select('id, nombre, email, password, tipo_usuario, plan_type, daily_search_limit, email_verified, email_verified_at, email_verificado, phone_verified, phone_verified_at, auth_user_id')
        .ilike('email', cleanEmail)
        .limit(2);

      if (legacyEmailError) {
        error = legacyEmailError;
      } else if (legacyEmailMatches?.length === 1) {
        user = legacyEmailMatches[0];
      } else if ((legacyEmailMatches?.length || 0) > 1) {
        console.warn('[AUTH_LOGIN_DEBUG]', {
          action: 'case_insensitive_email_ambiguous',
          email: cleanEmail,
          match_count: legacyEmailMatches?.length || 0,
          request_id: requestId,
        });
      }
    }

    if (error || !user) {
      console.warn('[AUTH_LOGIN_DEBUG]', {
        action: 'user_lookup_failed',
        email: cleanEmail,
        error: error ? error.message : null,
        request_id: requestId,
      });
      await logAuthenticationAudit({
        email: cleanEmail,
        event_type: 'login.failed',
        event_status: 'failed',
        failure_reason: error ? 'user_lookup_error' : 'invalid_credentials',
        request: buildAuthenticationAuditRequest(req),
      });
      res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
      return;
    }

    const storedPassword = typeof user.password === 'string' ? user.password : '';
    const isValidPassword = storedPassword
      ? await bcrypt.compare(plainPassword, storedPassword)
      : false;

    if (!isValidPassword) {
      console.warn('[AUTH_LOGIN_DEBUG]', {
        action: 'password_compare_failed',
        email: cleanEmail,
        user_id: user.id,
        request_id: requestId,
      });
      await logAuthenticationAudit({
        user_id: user.id,
        email: user.email || cleanEmail,
        event_type: 'login.failed',
        event_status: 'failed',
        failure_reason: 'invalid_credentials',
        request: buildAuthenticationAuditRequest(req),
      });
      res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
      return;
    }

    const authUserId = await ensureSupabaseAuthUserForPassword({
      userId: user.id,
      email: user.email,
      password: plainPassword,
      nombre: user.nombre,
      emailVerified: Boolean(user.email_verified_at || user.email_verified || user.email_verificado),
    });

    if (authUserId && authUserId !== user.auth_user_id) {
      const { error: authLinkError } = await supabase
        .from('users')
        .update({ auth_user_id: authUserId })
        .eq('id', user.id);

      if (!authLinkError) {
        user.auth_user_id = authUserId;
      }
    }

    const accountStatus = await getAccountStatus(req, user.id);

    const token = signToken({
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
    });

    await logAuthenticationAudit({
      user_id: user.id,
      email: user.email,
      event_type: 'login.success',
      event_status: 'success',
      request: buildAuthenticationAuditRequest(req),
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        fullName: user.nombre,
        email: user.email,
        tipo_usuario: user.tipo_usuario,
        plan_type: user.plan_type || (user.tipo_usuario === 'admin' ? 'admin' : 'free'),
        daily_search_limit:
          typeof user.daily_search_limit === 'number' || user.daily_search_limit === null
            ? user.daily_search_limit
            : user.tipo_usuario === 'admin'
              ? null
              : 3,
        email_verified: accountStatus?.email_verified ?? Boolean(user.email_verified_at || user.email_verified || user.email_verificado),
        email_verified_at: accountStatus?.email_verified_at || user.email_verified_at || null,
        phone_verified: accountStatus?.phone_verified ?? Boolean(user.phone_verified),
        phone_verified_at: accountStatus?.phone_verified_at || user.phone_verified_at || null,
        bonus_credits_available: accountStatus?.available_credits ?? await getActiveSearchCreditsCount(user.id),
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    await logAuthenticationAudit({
      email:
        typeof (req.body as { email?: unknown } | null)?.email === 'string'
          ? String((req.body as { email?: unknown }).email).trim().toLowerCase()
          : null,
      event_type: 'login.failed',
      event_status: 'failed',
      failure_reason: 'login_exception',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión',
    });
  }
});

app.get('/api/account/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const status = await getAccountStatus(req, req.user.id);

    if (!status) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    res.json({
      success: true,
      account: status,
    });
  } catch (error) {
    console.error('[ACCOUNT_STATUS_ERROR]', {
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo consultar el estado de la cuenta',
    });
  }
});

app.post('/api/auth/resend-verification', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, document_type, document_number, email_verified, email_verified_at, email_verificado, auth_user_id')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    const emailState = await syncEmailVerificationFromSupabase(req, {
      id: user.id,
      email: user.email,
      email_verified_at: user.email_verified_at,
      email_verificado: user.email_verificado,
      auth_user_id: user.auth_user_id,
      document_type: user.document_type,
      document_number: user.document_number,
    });

    if (emailState.email_verified) {
      res.json({
        success: true,
        message: 'El correo ya esta verificado',
        account: {
          email_verified: true,
          email_verified_at: emailState.email_verified_at,
        },
      });
      return;
    }

    const authUser = await getSupabaseAuthUserForPublicUser(user);

    if (!authUser) {
      res.status(409).json({
        success: false,
        message: 'No se pudo enlazar la cuenta de autenticacion. Inicia sesion nuevamente e intenta otra vez.',
      });
      return;
    }

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: {
        emailRedirectTo: buildPublicUrl('/configuracion'),
      },
    });

    if (resendError) {
      throw resendError;
    }

    await logAccountSecurityEvent(req, 'email_verification_resent', user.id, {
      email: user.email,
      source: 'settings',
    });

    res.json({
      success: true,
      message: 'Correo de verificacion reenviado',
    });
  } catch (error) {
    console.error('[AUTH_RESEND_VERIFICATION_ERROR]', {
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo reenviar el correo de verificacion',
    });
  }
});

app.post('/api/auth/password-reset', async (req: Request, res: Response) => {
  if (!(await requireTurnstile(req, res, '/api/auth/password-reset'))) {
    await logAuthenticationAudit({
      email:
        typeof (req.body as { email?: unknown } | null)?.email === 'string'
          ? String((req.body as { email?: unknown }).email).trim().toLowerCase()
          : null,
      event_type: 'password.reset.request',
      event_status: 'failed',
      failure_reason: 'turnstile_failed',
      request: buildAuthenticationAuditRequest(req),
    });
    return;
  }

  const parsed = passwordResetRequestSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    await logAuthenticationAudit({
      email:
        typeof (req.body as { email?: unknown } | null)?.email === 'string'
          ? String((req.body as { email?: unknown }).email).trim().toLowerCase()
          : null,
      event_type: 'password.reset.request',
      event_status: 'failed',
      failure_reason: 'invalid_email',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(400).json({
      success: false,
      message: 'Email invalido',
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();

  try {
    let passwordResetEmailErrorMessage: string | null = null;

    const { data: user } = await supabase
      .from('users')
      .select('id, email, auth_user_id')
      .eq('email', email)
      .maybeSingle();

    if (user?.auth_user_id) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildPublicUrl('/reset-password'),
      });

      if (error) {
        passwordResetEmailErrorMessage = error.message;
        console.warn('[AUTH_PASSWORD_RESET_EMAIL_FAILED]', {
          user_id: user.id,
          error: error.message,
        });

        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AUTH_PASSWORD_RESET_SUPABASE_ERROR_DEBUG]', {
            user_id: user.id,
            email,
            error,
          });
        }
      }

      await logAccountSecurityEvent(req, 'password_reset_requested', user.id, {
        email,
        delivery_attempted: !error,
      });
    } else {
      await logAccountSecurityEvent(req, 'password_reset_requested', user?.id || null, {
        email,
        delivery_attempted: false,
        reason: user ? 'missing_supabase_auth_link' : 'unknown_email',
      });
    }

    await logAuthenticationAudit({
      user_id: user?.id || null,
      email,
      event_type: 'password.reset.request',
      event_status: passwordResetEmailErrorMessage ? 'failed' : 'success',
      failure_reason: passwordResetEmailErrorMessage ? 'password_reset_delivery_failed' : null,
      request: buildAuthenticationAuditRequest(req),
    });

    res.json({
      success: true,
      message: 'Si el correo existe, enviaremos instrucciones para recuperar la contrasena.',
      ...(process.env.NODE_ENV !== 'production' && passwordResetEmailErrorMessage
        ? { debug_error_message: passwordResetEmailErrorMessage }
        : {}),
    });
  } catch (error) {
    console.error('[AUTH_PASSWORD_RESET_ERROR]', {
      email,
      error: error instanceof Error ? error.message : 'unknown',
    });
    await logAuthenticationAudit({
      email,
      event_type: 'password.reset.request',
      event_status: 'failed',
      failure_reason: 'password_reset_request_error',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo procesar la solicitud de recuperacion',
    });
  }
});

async function passwordResetCompleteHandler(req: Request, res: Response) {
  const parsed = passwordResetCompleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    await logAuthenticationAudit({
      event_type: 'password.reset.success',
      event_status: 'failed',
      failure_reason: 'invalid_payload',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(400).json({
      success: false,
      message: 'No se pudo completar la recuperacion.',
    });
    return;
  }

  const authorization = req.headers.authorization;
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!accessToken) {
    await logAuthenticationAudit({
      event_type: 'password.reset.success',
      event_status: 'failed',
      failure_reason: 'missing_supabase_access_token',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(401).json({
      success: false,
      message: 'No se pudo completar la recuperacion.',
    });
    return;
  }

  try {
    const result = await synchronizeRecoveredPassword(
      accessToken,
      parsed.data.new_password,
      {
        validateAccessToken: async (token) => {
          const { data, error } = await supabase.auth.getUser(token);
          const email = data.user?.email?.trim().toLowerCase() || '';
          if (error || !data.user?.id || !email) return null;
          return { id: data.user.id, email };
        },
        findLocalUser: async (authUserId) => {
          const linkedLookup = await supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', authUserId)
            .maybeSingle();
          if (linkedLookup.error) throw linkedLookup.error;
          if (linkedLookup.data) return linkedLookup.data;

          const matchingIdLookup = await supabase
            .from('users')
            .select('id')
            .eq('id', authUserId)
            .maybeSingle();
          if (matchingIdLookup.error) throw matchingIdLookup.error;
          return matchingIdLookup.data;
        },
        verifySupabasePassword: async ({ email, password, expectedUserId }) =>
          verifyPasswordWithAnonymousClient({
            supabaseUrl: SUPABASE_URL as string,
            supabaseAnonKey: SUPABASE_ANON_KEY as string,
            email,
            password,
            expectedUserId,
          }),
        hashPassword: (password) => bcrypt.hash(password, 10),
        updateLocalPassword: async (userId, passwordHash) => {
          const { data, error } = await supabase
            .from('users')
            .update({ password: passwordHash })
            .eq('id', userId)
            .select('id')
            .maybeSingle();
          return !error && Boolean(data?.id);
        },
        audit: async ({ userId, email, status, failureReason }) => {
          await logAuthenticationAudit({
            user_id: userId,
            email,
            event_type: 'password.reset.success',
            event_status: status,
            failure_reason: failureReason || null,
            request: buildAuthenticationAuditRequest(req),
          });
        },
      }
    );

    if (!result.ok) {
      console.warn('[AUTH_PASSWORD_RESET_COMPLETE_FAILED]', {
        reason: result.reason,
        request_id: getRequestId(req),
      });
      res.status(result.reason === 'invalid_session' ? 401 : 409).json({
        success: false,
        message: 'No se pudo completar la recuperacion. Intenta nuevamente.',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Contrasena actualizada correctamente',
    });
  } catch {
    console.error('[AUTH_PASSWORD_RESET_COMPLETE_ERROR]', {
      request_id: getRequestId(req),
    });
    await logAuthenticationAudit({
      event_type: 'password.reset.success',
      event_status: 'failed',
      failure_reason: 'password_reset_complete_error',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo completar la recuperacion. Intenta nuevamente.',
    });
  }
}

app.post('/api/auth/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    await logAuthenticationAudit({
      user_id: req.user?.id || null,
      email: req.user?.email || null,
      event_type: 'password.reset.success',
      event_status: 'failed',
      failure_reason: 'invalid_payload',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(400).json({
      success: false,
      message: 'La nueva contrasena debe tener al menos 8 caracteres',
      errors: parsed.error.flatten(),
    });
    return;
  }

  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, nombre, password, auth_user_id, email_verified_at, email_verified, email_verificado')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    if (parsed.data.current_password) {
      const storedPassword = typeof user.password === 'string' ? user.password : '';
      const currentPasswordOk = storedPassword
        ? await bcrypt.compare(parsed.data.current_password, storedPassword)
        : false;

      if (!currentPasswordOk) {
        await logAuthenticationAudit({
          user_id: user.id,
          email: user.email,
          event_type: 'password.reset.success',
          event_status: 'failed',
          failure_reason: 'invalid_current_password',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(400).json({
          success: false,
          message: 'La contrasena actual no es correcta',
        });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(parsed.data.new_password, 10);
    const authUserId =
      user.auth_user_id ||
      await ensureSupabaseAuthUserForPassword({
        userId: user.id,
        email: user.email,
        password: parsed.data.new_password,
        nombre: user.nombre,
        emailVerified: Boolean(user.email_verified_at || user.email_verified || user.email_verificado),
      });

    if (authUserId) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(authUserId, {
        password: parsed.data.new_password,
      });

      if (authUpdateError) {
        throw authUpdateError;
      }
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        password: hashedPassword,
        auth_user_id: authUserId,
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    await logAccountSecurityEvent(req, 'password_changed', user.id, {
      supabase_auth_user_id: authUserId,
    });

    await logAuthenticationAudit({
      user_id: user.id,
      email: user.email,
      event_type: 'password.reset.success',
      event_status: 'success',
      request: buildAuthenticationAuditRequest(req),
    });

    res.json({
      success: true,
      message: 'Contrasena actualizada correctamente',
    });
  } catch (error) {
    console.error('[AUTH_CHANGE_PASSWORD_ERROR]', {
      user_id: req.user?.id || null,
      error: error instanceof Error ? error.message : 'unknown',
    });
    await logAuthenticationAudit({
      user_id: req.user?.id || null,
      email: req.user?.email || null,
      event_type: 'password.reset.success',
      event_status: 'failed',
      failure_reason: 'change_password_error',
      request: buildAuthenticationAuditRequest(req),
    });
    res.status(500).json({
      success: false,
      message: 'No se pudo cambiar la contrasena',
    });
  }
});

app.post('/api/upgrade-events', authenticateToken, async (req: AuthRequest, res: Response) => {
  const parsed = upgradeEventSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Datos de evento inválidos',
      errors: parsed.error.flatten(),
    });
    return;
  }

  try {
    const { event_type, source, plan_type, metadata } = parsed.data;

    const { error } = await supabase.from('upgrade_events').insert({
      user_id: req.user?.id || null,
      event_type,
      source,
      plan_type: plan_type || null,
      metadata: {
        ...metadata,
        user_role: req.user?.tipo_usuario || null,
        timestamp_server: new Date().toISOString(),
      },
      ip_address: getRequestIp(req) || req.socket.remoteAddress || null,
      user_agent: getRequestUserAgent(req),
    });

    if (error) {
      throw error;
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('[upgrade-events] Error:', error);
    res.status(500).json({
      success: false,
      message: 'No se pudo registrar el evento',
    });
  }
});

// ================================
// TENANTS ROUTES
// ================================

app.get('/api/tenants/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  let searchedDocumentForAudit = '';
  let normalizedDocumentForAudit = '';
  let requestIp: string | null = null;
  let requestUserAgent: string | null = null;
  let requestId: string | null = null;

  try {
    const { cedula } = req.query;
    searchedDocumentForAudit = getSearchAuditDocumentValue(cedula);
    normalizedDocumentForAudit = normalizeSearchDocumentForAudit(searchedDocumentForAudit);
    const cleanCedula = typeof cedula === 'string' ? cedula.trim() : '';
    requestIp = getRequestIp(req);
    requestUserAgent = getRequestUserAgent(req);
    requestId = getRequestId(req);

    if (!cleanCedula) {
      await insertSearchAuditLog({
        tenant_id: null,
        user_id: req.user?.id || null,
        searched_document: searchedDocumentForAudit,
        normalized_document: normalizedDocumentForAudit,
        search_status: 'invalid_document',
        result_status: null,
        http_status: 400,
        credits_before: null,
        credits_after: null,
        plan_code: null,
        used_extra_credit: false,
        ip_address: requestIp,
        user_agent: requestUserAgent,
        request_id: requestId,
        error_code: 'DOCUMENT_REQUIRED',
        error_message: 'La cedula es requerida',
        metadata: {
          reason: 'missing_document',
        },
      });
      res.status(400).json({
        success: false,
        message: 'La cédula es requerida',
      });
      return;
    }

    if (!isValidCedula(cleanCedula)) {
      await insertSearchAuditLog({
        tenant_id: null,
        user_id: req.user?.id || null,
        searched_document: searchedDocumentForAudit,
        normalized_document: normalizedDocumentForAudit,
        search_status: 'invalid_document',
        result_status: null,
        http_status: 400,
        credits_before: null,
        credits_after: null,
        plan_code: null,
        used_extra_credit: false,
        ip_address: requestIp,
        user_agent: requestUserAgent,
        request_id: requestId,
        error_code: 'INVALID_DOCUMENT',
        error_message: 'Formato de cedula invalido',
        metadata: {
          reason: 'invalid_format',
        },
      });
      res.status(400).json({
        success: false,
        message: 'Formato de cédula inválido (6-10 dígitos)',
      });
      return;
    }

    const searchAuditContext: SearchAuditRequestContext = {
      searchedDocument: searchedDocumentForAudit,
      normalizedDocument: normalizedDocumentForAudit,
      requestIp,
      requestUserAgent,
      requestId,
    };
    const searchLimitDecision = await assertSearchLimit(req, res, searchAuditContext);
    if (!searchLimitDecision.allowed) return;

    const limitInfo = searchLimitDecision.limitInfo;
    const adjustedLimitInfo = {
      ...limitInfo,
      used_searches:
        limitInfo.daily_limit !== null && !limitInfo.bonus_credit_used
          ? limitInfo.used_searches + 1
          : limitInfo.used_searches,
      remaining_searches:
        limitInfo.daily_limit === null
          ? null
          : limitInfo.bonus_credit_used
            ? limitInfo.remaining_searches
            : Math.max(0, (limitInfo.remaining_searches ?? 0) - 1),
      bonus_credits_available:
        limitInfo.bonus_credit_used && typeof limitInfo.bonus_credits_available === 'number'
          ? Math.max(0, limitInfo.bonus_credits_available - 1)
          : limitInfo.bonus_credits_available,
    };

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, cedula, nombre')
      .eq('cedula', cleanCedula)
      .maybeSingle();

    if (tenantError) {
      throw tenantError;
    }

    if (!tenant) {
      let searchLogId: string | null = null;
      try {
        searchLogId = await insertSearchLog({
          user_id: req.user?.id || null,
          tenant_id: null,
          cedula_consultada: cleanCedula,
          found: false,
          score_normalized: null,
          classification: null,
          ip_address: requestIp,
          user_agent: requestUserAgent,
        });
      } catch (searchLogError) {
        console.error(`[search_logs] Error guardando auditoría de búsqueda ${cleanCedula}:`, searchLogError);
      }

      if (searchLimitDecision.bonusCreditId) {
        await consumeSearchCredit(searchLimitDecision.bonusCreditId, searchLogId);
      }

      await insertSearchAuditLog({
        tenant_id: null,
        user_id: req.user?.id || null,
        searched_document: searchedDocumentForAudit,
        normalized_document: normalizedDocumentForAudit,
        search_status: 'success',
        result_status: 'no_history',
        http_status: 200,
        credits_before: getSearchAuditCreditBalance(limitInfo),
        credits_after: getSearchAuditCreditBalance(adjustedLimitInfo),
        plan_code: adjustedLimitInfo.plan_type,
        used_extra_credit: Boolean(limitInfo.bonus_credit_used),
        ip_address: requestIp,
        user_agent: requestUserAgent,
        request_id: requestId,
        error_code: null,
        error_message: null,
        metadata: {
          legacy_search_log_id: searchLogId,
          daily_limit: adjustedLimitInfo.daily_limit,
          used_searches: adjustedLimitInfo.used_searches,
          remaining_searches: adjustedLimitInfo.remaining_searches,
          bonus_credits_available: adjustedLimitInfo.bonus_credits_available,
        },
      });

      const legalFlags = buildSearchLegalFlags({ reports: [], legalSignals: [] });
      const scoreExplanation = buildScoreExplanation({
        score: null,
        classification: null,
        reports: [],
        legalSignals: [],
        legalFlags,
      });
      console.log('[SEARCH_LEGAL_FLAGS]', {
        action: 'search_no_tenant',
        user_id: req.user?.id || null,
        tenant_id: null,
        ...legalFlags,
      });

      res.json({
        success: true,
        cedula: cleanCedula,
        nombre: null,
        score: null,
        clasificacion: null,
        clasificacion_detallada: null,
        total_reportes: 0,
        reportes_aprobados: 0,
        procesos_judiciales: 0,
        detalle_reportes: [],
        detalle_procesos: [],
        score_factores: [],
        score_version: SCORE_CONFIG.VERSION,
        legal_flags: legalFlags,
        score_explanation: scoreExplanation,
        ...buildRentalHistorySearchPayload([], adjustedLimitInfo.plan_type),
        ...adjustedLimitInfo,
      });
      return;
    }

    const reportsQuery = await supabase
      .from('reports')
      .select(SEARCH_REPORT_SELECT_COLUMNS.join(', '))
      .eq('tenant_id', tenant.id)
      .eq('estado', 'aprobado')
      .eq('report_verification_status', 'verified')
      .eq('scoring_eligibility_status', 'eligible')
      .order('fecha_reporte', { ascending: false });
    let reportes = reportsQuery.data as Array<Record<string, unknown>> | null;
    let reportesError = reportsQuery.error as SupabaseRpcErrorLike | null;

    if (reportesError) {
      if (!isMissingColumnError(reportesError)) {
        throw reportesError;
      }

      console.warn('[SEARCH_LEGAL_FLAGS]', {
        action: 'reports_legal_columns_unavailable',
        user_id: req.user?.id || null,
        tenant_id: tenant.id,
      });

      const fallbackReportQuery = await supabase
        .from('reports')
        .select('id, tenant_id, tipo_problema, descripcion, fecha_reporte, estado')
        .eq('tenant_id', tenant.id)
        .eq('estado', 'aprobado')
        .order('fecha_reporte', { ascending: false });

      reportes = fallbackReportQuery.data as Array<Record<string, unknown>> | null;
      reportesError = fallbackReportQuery.error as SupabaseRpcErrorLike | null;

      if (reportesError) {
        throw reportesError;
      }
    }

    const allReportsForFlagsQuery = await supabase
      .from('reports')
      .select(SEARCH_REPORT_SELECT_COLUMNS.join(', '))
      .eq('tenant_id', tenant.id)
      .order('fecha_reporte', { ascending: false });
    let allReportsForFlags =
      allReportsForFlagsQuery.data as Array<Record<string, unknown>> | null;
    let allReportsForFlagsError =
      allReportsForFlagsQuery.error as SupabaseRpcErrorLike | null;

    if (allReportsForFlagsError) {
      if (!isMissingColumnError(allReportsForFlagsError)) {
        throw allReportsForFlagsError;
      }

      allReportsForFlags = reportes || [];
      allReportsForFlagsError = null;
    }

    const legalSignalsQuery = await supabase
      .from('legal_case_signals')
      .select(SEARCH_LEGAL_CASE_SIGNAL_SELECT_COLUMNS.join(', '))
      .eq('tenant_id', tenant.id)
      .eq('status', 'verified')
      .eq('relevance_for_rental_risk', true)
      .eq('score_impact_enabled', true)
      .neq('dispute_status', 'disputed')
      .order('process_date', { ascending: false });
    let procesos = legalSignalsQuery.data as Array<Record<string, unknown>> | null;
    let procesosError = legalSignalsQuery.error as SupabaseRpcErrorLike | null;

    if (procesosError) {
      if (!isMissingColumnError(procesosError)) {
        throw procesosError;
      }

      console.warn('[SEARCH_LEGAL_FLAGS]', {
        action: 'judicial_signal_legal_columns_unavailable',
        user_id: req.user?.id || null,
        tenant_id: tenant.id,
      });

      const fallbackSignalQuery = await supabase
        .from('legal_case_signals')
        .select(
          [
            'id',
            'tenant_id',
            'source',
            'source_reference',
            'process_type',
            'process_subject',
            'court_name',
            'city',
            'process_date',
            'status',
            'relevance_for_rental_risk',
            'score_impact_enabled',
          ].join(', ')
        )
        .eq('tenant_id', tenant.id)
        .eq('status', 'verified')
        .eq('relevance_for_rental_risk', true)
        .eq('score_impact_enabled', true)
        .order('process_date', { ascending: false });

      procesos = fallbackSignalQuery.data as Array<Record<string, unknown>> | null;
      procesosError = fallbackSignalQuery.error as SupabaseRpcErrorLike | null;

      if (procesosError) {
        throw procesosError;
      }
    }

    const { data: rentalHistories, error: rentalHistoriesError } = await supabase
      .from('tenant_rental_histories')
      .select(
        [
          'id',
          'cedula_inquilino',
          'source_type',
          'city',
          'property_type',
          'contract_start_date',
          'contract_end_date',
          'contract_duration_months',
          'monthly_rent_amount',
          'currency',
          'had_late_payments',
          'late_payment_months',
          'had_property_damage',
          'formal_handover',
          'had_debt_at_handover',
          'has_supporting_documents',
          'verified_at',
          'visibility_level',
        ].join(', ')
      )
      .eq('cedula_inquilino', cleanCedula)
      .eq('status', 'verified')
      .eq('dispute_status', 'none')
      .in('visibility_level', ['paid_only', 'pro_only'])
      .order('verified_at', { ascending: false })
      .limit(25);

    if (rentalHistoriesError) {
      throw rentalHistoriesError;
    }

    const approvedReports = (reportes || []).filter(isReportEligibleForScoring);
    const legalSignals = procesos || [];
    const verifiedRentalHistories = ((rentalHistories || []) as unknown as Array<Record<string, unknown>>).map(
      (history) =>
        ({
          ...history,
          subject_type: 'natural_person',
          subject_document_type: 'CC',
          subject_document_number: history.cedula_inquilino,
        }) as unknown as SearchRentalHistoryRow
    );
    const legalFlags = buildSearchLegalFlags({
      reports: allReportsForFlags || approvedReports,
      legalSignals: legalSignals,
    });

    console.log('[SEARCH_LEGAL_FLAGS]', {
      action: 'search_result',
      user_id: req.user?.id || null,
      tenant_id: tenant.id,
      ...legalFlags,
    });

    let persistedScore: {
      score_normalized: number;
      classification: string;
      factors: any[] | null;
      version: string;
    } | null = null;

    try {
      persistedScore = await getCurrentScore(tenant.id);

      if (!persistedScore) {
        console.warn(
          `[score] tenant_current_scores no encontrado para tenant_id=${tenant.id}, recalculando`
        );
        persistedScore = await calculateAndStoreScore(tenant.id, tenant.cedula);
      }
    } catch (scoreError) {
      console.error(
        `[score] Error resolviendo score para tenant_id=${tenant.id}, cedula=${tenant.cedula}:`,
        scoreError
      );
      throw scoreError;
    }

    const score = persistedScore?.score_normalized ?? null;
    const clasificacion = persistedScore?.classification
      ? mapScoreClassificationToSpanish(persistedScore.classification)
      : null;
    const clasificacionDetallada = persistedScore?.classification
      ? mapScoreClassificationDetailToSpanish(persistedScore.classification)
      : null;
    const scoreExplanation = buildScoreExplanation({
      score,
      classification: clasificacion,
      reports: approvedReports,
      legalSignals,
      legalFlags,
    });

    let searchLogId: string | null = null;
    try {
      searchLogId = await insertSearchLog({
        user_id: req.user?.id || null,
        tenant_id: tenant.id,
        cedula_consultada: cleanCedula,
        found: true,
        score_normalized: score,
        classification: persistedScore?.classification ?? null,
        ip_address: requestIp,
        user_agent: requestUserAgent,
      });
    } catch (searchLogError) {
      console.error(
        `[search_logs] Error guardando auditoría de búsqueda tenant_id=${tenant.id}, cedula=${cleanCedula}:`,
        searchLogError
      );
    }

    if (searchLimitDecision.bonusCreditId) {
      await consumeSearchCredit(searchLimitDecision.bonusCreditId, searchLogId);
    }

    await insertSearchAuditLog({
      tenant_id: tenant.id,
      user_id: req.user?.id || null,
      searched_document: searchedDocumentForAudit,
      normalized_document: normalizedDocumentForAudit,
      search_status: 'success',
      result_status: 'found',
      http_status: 200,
      credits_before: getSearchAuditCreditBalance(limitInfo),
      credits_after: getSearchAuditCreditBalance(adjustedLimitInfo),
      plan_code: adjustedLimitInfo.plan_type,
      used_extra_credit: Boolean(limitInfo.bonus_credit_used),
      ip_address: requestIp,
      user_agent: requestUserAgent,
      request_id: requestId,
      error_code: null,
      error_message: null,
      metadata: {
        legacy_search_log_id: searchLogId,
        approved_reports_count: approvedReports.length,
        legal_signals_count: legalSignals.length,
        rental_histories_count: verifiedRentalHistories.length,
        score_available: score !== null,
        daily_limit: adjustedLimitInfo.daily_limit,
        used_searches: adjustedLimitInfo.used_searches,
        remaining_searches: adjustedLimitInfo.remaining_searches,
        bonus_credits_available: adjustedLimitInfo.bonus_credits_available,
      },
    });

    res.json({
      success: true,
      cedula: tenant.cedula,
      nombre: tenant.nombre,
      score,
      clasificacion,
      clasificacion_detallada: clasificacionDetallada,
      total_reportes: approvedReports.length,
      reportes_aprobados: approvedReports.length,
      procesos_judiciales: legalSignals.length,
      detalle_reportes: approvedReports,
      detalle_procesos: legalSignals,
      score_factores: persistedScore?.factors || [],
      score_version: persistedScore?.version || SCORE_CONFIG.VERSION,
      legal_flags: legalFlags,
      score_explanation: scoreExplanation,
      ...buildRentalHistorySearchPayload(verifiedRentalHistories, adjustedLimitInfo.plan_type),
      ...adjustedLimitInfo,
    });
  } catch (error) {
    console.error('Error al buscar arrendatario:', error);
    await insertSearchAuditLog({
      tenant_id: null,
      user_id: req.user?.id || null,
      searched_document: searchedDocumentForAudit,
      normalized_document: normalizedDocumentForAudit,
      search_status: 'internal_error',
      result_status: null,
      http_status: 500,
      credits_before: null,
      credits_after: null,
      plan_code: null,
      used_extra_credit: false,
      ip_address: requestIp,
      user_agent: requestUserAgent,
      request_id: requestId,
      error_code: getSafeAuditErrorCode(error),
      error_message: getSafeAuditErrorMessage(error),
      metadata: {
        phase: 'tenant_search',
      },
    });
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

app.get('/api/tenants/:cedula', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { cedula } = req.params;

    if (!cedula || !isValidCedula(String(cedula))) {
      res.status(400).json({
        success: false,
        message: 'Cédula inválida (6-10 dígitos)',
      });
      return;
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, cedula, nombre, ciudad')
      .eq('cedula', cedula)
      .maybeSingle();

    if (tenantError) {
      throw tenantError;
    }

    if (!tenant) {
      res.status(404).json({
        success: false,
        message: 'Inquilino no encontrado',
      });
      return;
    }

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select(REPORT_SELECT_COLUMNS.join(', '))
      .eq('tenant_id', tenant.id)
      .order('fecha_reporte', { ascending: false });

    if (reportsError) {
      throw reportsError;
    }

    res.json({
      success: true,
      tenant,
      reports: reports || [],
    });
  } catch (error) {
    console.error('Error en búsqueda detalle:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno',
    });
  }
});

// ================================
// REPORTS ROUTES
// ================================

app.post('/api/reports', authenticateToken, async (req: AuthRequest, res: Response) => {
  let reportCreatePhase = 'request_received';
  let reportCreateTable: string | null = null;
  let reportCreateColumns: readonly string[] | null = null;
  let reporterUserIdForLog: string | null = null;
  let reportIdForLog: string | null = null;
  let reportTenantIdForAudit: string | null = null;
  let reportSubjectDocumentForAudit: string | null = null;
  let reportTypeForAudit: string | null = null;
  let legalBasisForAudit: string | null = null;

  const setReportCreatePhase = (
    phase: string,
    table: string | null = null,
    columns: readonly string[] | null = null
  ) => {
    reportCreatePhase = phase;
    reportCreateTable = table;
    reportCreateColumns = columns;
  };

  const logReportCreatePhase = (
    action: string,
    extra: Record<string, unknown> = {}
  ) => {
    console.log('[REPORT_CREATE]', {
      action,
      phase: reportCreatePhase,
      table: reportCreateTable,
      columns: reportCreateColumns,
      user_id: reporterUserIdForLog,
      report_id: reportIdForLog,
      ...extra,
    });
  };

  try {
    setReportCreatePhase('payload_validation');
    const { nombre, cedula, telefono, ciudad, tipo_problema, descripcion } = req.body ?? {};
    const evidenceInput = reportEvidenceBodySchema.safeParse({
      legal_declaration_accepted: req.body?.legal_declaration_accepted,
      evidence: req.body?.evidence,
    });
    const legalTraceInput = legalTracePatchSchema.safeParse({
      data_origin: req.body?.data_origin,
      source_type: req.body?.source_type,
      source_name: req.body?.source_name,
      source_reference: req.body?.source_reference,
      source_url: req.body?.source_url,
      legal_basis: req.body?.legal_basis,
      public_source_flag: req.body?.public_source_flag,
      impacts_scoring: req.body?.impacts_scoring,
      dispute_status: req.body?.dispute_status,
      legal_review_status: req.body?.legal_review_status,
      legal_notes: req.body?.legal_notes,
    });

    logReportCreatePhase('payload_parsed', {
      legal_trace_valid: legalTraceInput.success,
      evidence_valid: evidenceInput.success,
      evidence_count: Array.isArray(req.body?.evidence) ? req.body.evidence.length : 0,
      secure_document_count: Array.isArray(req.body?.evidence)
        ? req.body.evidence.filter((evidence: { secure_document_id?: unknown }) =>
            Boolean(evidence?.secure_document_id)
          ).length
        : 0,
      has_storage_path_count: Array.isArray(req.body?.evidence)
        ? req.body.evidence.filter((evidence: { storage_path?: unknown }) =>
            Boolean(evidence?.storage_path)
          ).length
        : 0,
    });

    if (!legalTraceInput.success) {
      console.warn('[REPORT_CREATE]', {
        action: 'payload_validation_failed',
        phase: reportCreatePhase,
        reason: 'legal_trace_invalid',
        issues: legalTraceInput.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
      res.status(400).json({
        success: false,
        message: 'Metadata legal invalida',
        errors: legalTraceInput.error.flatten(),
      });
      return;
    }

    if (!evidenceInput.success) {
      console.warn('[REPORT_CREATE]', {
        action: 'payload_validation_failed',
        phase: reportCreatePhase,
        reason: 'evidence_invalid',
        issues: evidenceInput.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
      res.status(400).json({
        success: false,
        message: 'Debes aceptar la declaracion legal y adjuntar al menos una evidencia documental.',
        errors: evidenceInput.error.flatten(),
      });
      return;
    }

    const cleanNombre = String(nombre ?? '').trim();
    const cleanCedula = String(cedula ?? '').trim();
    const cleanTelefono = String(telefono ?? '').trim();
    const cleanCiudad = String(ciudad ?? '').trim();
    const cleanTipoProblema = String(tipo_problema ?? '').trim();
    const cleanDescripcion = String(descripcion ?? '').trim();
    reportSubjectDocumentForAudit = cleanCedula || null;
    reportTypeForAudit = cleanTipoProblema || null;
    legalBasisForAudit = legalTraceInput.success ? legalTraceInput.data.legal_basis || null : null;

    if (!cleanNombre || !cleanCedula || !cleanCiudad || !cleanTipoProblema || !cleanDescripcion) {
      console.warn('[REPORT_CREATE]', {
        action: 'payload_validation_failed',
        phase: reportCreatePhase,
        reason: 'required_fields_missing',
        missing_fields: {
          nombre: !cleanNombre,
          cedula: !cleanCedula,
          ciudad: !cleanCiudad,
          tipo_problema: !cleanTipoProblema,
          descripcion: !cleanDescripcion,
        },
      });
      res.status(400).json({
        success: false,
        message: 'Todos los campos obligatorios son requeridos',
      });
      return;
    }

    if (cleanNombre.length < 3) {
      res.status(400).json({
        success: false,
        message: 'El nombre debe tener al menos 3 caracteres',
      });
      return;
    }

    if (!isValidCedula(cleanCedula)) {
      res.status(400).json({
        success: false,
        message: 'Cédula inválida (6-10 dígitos)',
      });
      return;
    }

    if (cleanTelefono && !/^\d{7,15}$/.test(cleanTelefono)) {
      res.status(400).json({
        success: false,
        message: 'Teléfono inválido (7-15 dígitos)',
      });
      return;
    }

    if (cleanCiudad.length < 2) {
      res.status(400).json({
        success: false,
        message: 'La ciudad debe tener al menos 2 caracteres',
      });
      return;
    }

    if (cleanDescripcion.length < 20) {
      res.status(400).json({
        success: false,
        message: 'La descripción debe tener al menos 20 caracteres',
      });
      return;
    }

    const evidencePayloadInput = evidenceInput.data.evidence;
    const reporterUserId = req.user?.id;
    reporterUserIdForLog = reporterUserId || null;

    setReportCreatePhase('auth_user');
    logReportCreatePhase('auth_user_resolved', {
      authenticated: Boolean(reporterUserId),
      jwt_tipo_usuario: req.user?.tipo_usuario || null,
    });

    if (!reporterUserId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    const reportSecureDocumentIds = evidencePayloadInput
      .map((evidence) => evidence.secure_document_id)
      .filter((documentId): documentId is string => Boolean(documentId));
    setReportCreatePhase('secure_document_read', 'secure_documents', [
      'id',
      'owner_user_id',
      'document_category',
      'storage_path',
      'status',
    ]);
    logReportCreatePhase('secure_document_read_start', {
      secure_document_count: reportSecureDocumentIds.length,
      allowed_categories: ['report_evidence', 'contract', 'other'],
    });
    const reportSecureDocuments =
      reportSecureDocumentIds.length > 0
        ? await fetchOwnedSecureDocumentsByIds(reporterUserId, reportSecureDocumentIds, [
            'report_evidence',
            'contract',
            'other',
          ])
        : [];
    logReportCreatePhase('secure_document_read_ok', {
      secure_document_count: reportSecureDocuments.length,
      document_categories: reportSecureDocuments.map((document) => document.document_category),
      storage_path_hints: reportSecureDocuments.map((document) =>
        sanitizeStoragePathForLog(document.storage_path)
      ),
    });
    const reportSecureDocumentById = reportSecureDocuments.reduce<
      Record<string, SecureDocumentAccessMetadata>
    >((acc, document) => {
      acc[document.id] = document;
      return acc;
    }, {});

    setReportCreatePhase('identity_eligibility', 'users', [
      'id',
      'identity_verification_status',
      'reporting_eligibility_status',
    ]);
    logReportCreatePhase('identity_eligibility_read_start');
    let reporterIdentity: IdentityGateRow | null = null;
    try {
      reporterIdentity = await requireVerifiedIdentityForSensitiveContribution(
        req,
        res,
        'report'
      );
    } catch (reporterIdentityError) {
      console.error('[REPORT_CREATE]', {
        action: 'identity_eligibility_read_error',
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
        user_id: reporterUserIdForLog,
        ...buildSupabaseErrorLog(reporterIdentityError),
      });
      throw reporterIdentityError;
    }

    if (!reporterIdentity) {
      return;
    }

    logReportCreatePhase('identity_eligibility_read_ok', {
      identity_verification_status: reporterIdentity?.identity_verification_status || null,
      reporting_eligibility_status: reporterIdentity?.reporting_eligibility_status || null,
    });

    setReportCreatePhase('tenant_lookup', 'tenants', ['id', 'cedula']);
    logReportCreatePhase('tenant_lookup_start');
    let { data: tenant, error: tenantLookupError } = await supabase
      .from('tenants')
      .select('id')
      .eq('cedula', cleanCedula)
      .maybeSingle();

    if (tenantLookupError) {
      console.error('[REPORT_CREATE]', {
        action: 'tenant_lookup_error',
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
        user_id: reporterUserIdForLog,
        ...buildSupabaseErrorLog(tenantLookupError),
      });
      throw tenantLookupError;
    }

    if (!tenant) {
      setReportCreatePhase('tenant_insert', 'tenants', [
        'nombre',
        'cedula',
        'telefono',
        'ciudad',
        'fecha_creacion',
      ]);
      logReportCreatePhase('tenant_insert_start');
      const { data: newTenant, error: tenantInsertError } = await supabase
        .from('tenants')
        .insert({
          nombre: normalizeText(cleanNombre),
          cedula: cleanCedula,
          telefono: cleanTelefono || null,
          ciudad: normalizeText(cleanCiudad),
          fecha_creacion: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (tenantInsertError || !newTenant) {
        console.error('[REPORT_CREATE]', {
          action: 'tenant_insert_error',
          phase: reportCreatePhase,
          table: reportCreateTable,
          columns: reportCreateColumns,
          user_id: reporterUserIdForLog,
          ...buildSupabaseErrorLog(tenantInsertError || new Error('No se pudo crear el arrendatario')),
        });
        throw tenantInsertError || new Error('No se pudo crear el arrendatario');
      }

      tenant = newTenant;
      logReportCreatePhase('tenant_insert_ok', {
        tenant_id: tenant.id,
      });
    } else {
      logReportCreatePhase('tenant_lookup_ok', {
        tenant_id: tenant.id,
      });
    }

    setReportCreatePhase('insert_reports', 'reports', [
      'tenant_id',
      'tipo_problema',
      'descripcion',
      'reportado_por',
    ]);
    logReportCreatePhase('insert_reports_rpc_start', {
      rpc: 'create_report_with_limit',
      tenant_id: tenant.id,
    });
    const { data, error } = await supabase.rpc('create_report_with_limit', {
      p_tenant_id: tenant.id,
      p_tipo_problema: cleanTipoProblema,
      p_descripcion: cleanDescripcion,
      p_reportado_por: reporterUserId,
    });

    if (error) {
      const rpcErrorType = getReportRpcErrorType(error);
      console.error('[REPORT_CREATE]', {
        action: 'insert_reports_rpc_error',
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
        user_id: reporterUserIdForLog,
        rpc: 'create_report_with_limit',
        rpc_error_type: rpcErrorType,
        ...buildSupabaseErrorLog(error),
      });

      if (rpcErrorType === 'rate_limit') {
        res.status(429).json({
          success: false,
          message: 'Has alcanzado el límite de 3 reportes en 24 horas',
        });
        return;
      }

      if (rpcErrorType === 'duplicate') {
        res.status(409).json({
          success: false,
          message: 'Ya has reportado a este inquilino anteriormente',
        });
        return;
      }

      throw error;
    }

    let report = (Array.isArray(data) ? data[0] : data) as CreatedReportRow | null;

    if (!report) {
      throw new Error('La función create_report_with_limit no devolvió un reporte');
    }

    reportIdForLog = report.id;
    reportTenantIdForAudit = report.tenant_id;
    logReportCreatePhase('insert_reports_rpc_ok', {
      report_id: report.id,
      tenant_id: report.tenant_id,
    });

    const legalTracePayload = {
      ...buildLegalTracePayload(legalTraceInput.data),
      evidence_required: true,
      evidence_status: 'submitted',
      legal_declaration_accepted: true,
      legal_declaration_text: REPORT_LEGAL_DECLARATION_TEXT,
      report_verification_status: 'pending_verification',
    };

    setReportCreatePhase('creation_workflow_review', 'reports', Object.keys(legalTracePayload));
    logReportCreatePhase('creation_workflow_review_update_start', {
      changed_fields: Object.keys(legalTracePayload),
    });
    const { data: updatedReport, error: legalTraceError } = await supabase
      .from('reports')
      .update(legalTracePayload)
      .eq('id', report.id)
      .select(REPORT_SELECT_COLUMNS.join(', '))
      .single();

    if (legalTraceError || !updatedReport) {
      console.error('[REPORT_CREATE]', {
        action: 'creation_workflow_review_update_error',
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
        user_id: reporterUserIdForLog,
        report_id: reportIdForLog,
        ...buildSupabaseErrorLog(legalTraceError || new Error('No se pudo guardar la trazabilidad legal')),
      });
      throw legalTraceError || new Error('No se pudo guardar la trazabilidad legal');
    }

    report = updatedReport as unknown as CreatedReportRow;

    console.log('[LEGAL_TRACEABILITY]', {
      action: 'report_created_with_trace',
      report_id: report.id,
      user_id: reporterUserId,
      changed_fields: Object.keys(legalTracePayload),
    });

    logReportCreatePhase('creation_workflow_review_update_ok', {
      report_verification_status: report.report_verification_status || null,
      scoring_eligibility_status: report.scoring_eligibility_status || null,
      evidence_status: report.evidence_status || null,
    });

    setReportCreatePhase('evidence_metadata_build', 'report_evidence_files', [
      'report_id',
      'uploaded_by_user_id',
      'evidence_type',
      'file_name',
      'storage_path',
      'mime_type',
      'file_size',
      'sha256_hash',
      'legal_declaration_accepted',
      'uploaded_at',
    ]);
    const evidenceRows = evidencePayloadInput.map((evidence) => {
      const secureDocument = evidence.secure_document_id
        ? reportSecureDocumentById[evidence.secure_document_id]
        : null;

      return {
        report_id: report!.id,
        uploaded_by_user_id: reporterUserId,
        evidence_type: evidence.evidence_type,
        file_name: secureDocument?.original_file_name || evidence.file_name,
        storage_path: secureDocument?.storage_path || evidence.storage_path,
        mime_type: secureDocument?.mime_type || evidence.mime_type,
        file_size: secureDocument?.file_size || evidence.file_size,
        sha256_hash: normalizeNullableText(secureDocument?.sha256_hash || evidence.sha256_hash, 64),
        legal_declaration_accepted: true,
        uploaded_at: new Date().toISOString(),
      };
    });

    logReportCreatePhase('evidence_metadata_built', {
      evidence_count: evidenceRows.length,
      evidence_types: evidenceRows.map((evidence) => evidence.evidence_type),
      storage_path_hints: evidenceRows.map((evidence) =>
        sanitizeStoragePathForLog(evidence.storage_path)
      ),
      secure_document_backed_count: evidencePayloadInput.filter((evidence) =>
        Boolean(evidence.secure_document_id)
      ).length,
    });

    if (evidenceRows.some((evidence) => !evidence.storage_path)) {
      console.warn('[REPORT_CREATE]', {
        action: 'evidence_metadata_invalid',
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
        user_id: reporterUserIdForLog,
        report_id: reportIdForLog,
        reason: 'missing_storage_path',
      });
      res.status(400).json({
        success: false,
        message: 'storage_path heredado o secure_document_id confirmado es requerido',
      });
      return;
    }

    setReportCreatePhase('evidence_metadata_insert', 'report_evidence_files', [
      ...REPORT_EVIDENCE_SELECT_COLUMNS,
      'storage_path',
    ]);
    logReportCreatePhase('evidence_metadata_insert_start', {
      evidence_count: evidenceRows.length,
    });
    const { data: evidenceFiles, error: evidenceError } = await supabase
      .from('report_evidence_files')
      .insert(evidenceRows)
      .select(REPORT_EVIDENCE_SELECT_COLUMNS.join(', '));

    if (evidenceError) {
      console.error('[REPORT_CREATE]', {
        action: 'evidence_metadata_insert_error',
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
        user_id: reporterUserIdForLog,
        report_id: reportIdForLog,
        ...buildSupabaseErrorLog(evidenceError),
      });
      throw evidenceError;
    }

    logReportCreatePhase('evidence_metadata_insert_ok', {
      evidence_count: evidenceFiles?.length || 0,
    });

    if (reportSecureDocumentIds.length > 0) {
      setReportCreatePhase('secure_document_attach', 'secure_documents', [
        'related_entity_type',
        'related_entity_id',
      ]);
      logReportCreatePhase('secure_document_attach_start', {
        secure_document_count: reportSecureDocumentIds.length,
      });
      await attachSecureDocumentsToEntity(reportSecureDocumentIds, 'report', report.id);
      logReportCreatePhase('secure_document_attach_ok', {
        secure_document_count: reportSecureDocumentIds.length,
      });
    }

    console.log('[REPORT_EVIDENCE]', {
      action: 'submitted',
      report_id: report.id,
      user_id: reporterUserId,
      evidence_count: evidenceRows.length,
      evidence_types: evidenceRows.map((evidence) => evidence.evidence_type),
      legal_declaration_accepted: true,
    });

    await logLegalReportAudit({
      tenant_id: report.tenant_id,
      report_id: report.id,
      actor_user_id: reporterUserId,
      actor_role: req.user?.tipo_usuario || 'user',
      event_type: 'report.submitted',
      event_status: 'success',
      report_status_after: report.estado,
      review_status_after: report.report_verification_status || null,
      subject_document_number: cleanCedula,
      subject_document_type: 'cedula',
      report_type: report.tipo_problema,
      legal_basis: report.legal_basis || legalTraceInput.data.legal_basis || null,
      evidence_count: evidenceRows.length,
      evidence_hashes: evidenceRows
        .map((evidence) => evidence.sha256_hash)
        .filter((hash): hash is string => Boolean(hash)),
      metadata: {
        data_origin: report.data_origin || legalTraceInput.data.data_origin || null,
        source_type: report.source_type || legalTraceInput.data.source_type || null,
        public_source_flag:
          report.public_source_flag ?? legalTraceInput.data.public_source_flag ?? null,
        evidence_types: evidenceRows.map((evidence) => evidence.evidence_type),
        legal_declaration_accepted: true,
      },
      request: buildLegalReportAuditRequest(req),
    });

    res.status(201).json({
      success: true,
      message: 'Reporte creado exitosamente y pendiente de revisión',
      report,
      evidence: evidenceFiles || [],
    });
  } catch (error: any) {
    console.error('[REPORT_CREATE_ERROR]', {
      phase: reportCreatePhase,
      table: reportCreateTable,
      columns: reportCreateColumns,
      user_id: reporterUserIdForLog,
      report_id: reportIdForLog,
      message: error instanceof Error ? error.message : getSupabaseErrorMessage(error),
      ...buildSupabaseErrorLog(error),
    });

    await logLegalReportAudit({
      tenant_id: reportTenantIdForAudit,
      report_id: reportIdForLog,
      actor_user_id: reporterUserIdForLog,
      actor_role: req.user?.tipo_usuario || 'user',
      event_type: 'report.submitted',
      event_status: 'error',
      subject_document_number: reportSubjectDocumentForAudit,
      subject_document_type: reportSubjectDocumentForAudit ? 'cedula' : null,
      report_type: reportTypeForAudit,
      legal_basis: legalBasisForAudit,
      error_code: reportCreatePhase,
      error_message: error instanceof Error ? error.message : getSupabaseErrorMessage(error),
      metadata: {
        phase: reportCreatePhase,
        table: reportCreateTable,
        columns: reportCreateColumns,
      },
      request: buildLegalReportAuditRequest(req),
    });

    if (error?.message?.includes('descripcion_length')) {
      res.status(400).json({
        success: false,
        message: 'La descripción debe tener al menos 20 caracteres',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

app.post('/api/rental-histories', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const reporterUserId = req.user?.id;

    if (!reporterUserId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      });
      return;
    }

    await requireVerifiedIdentityForSensitiveContribution(req, res, 'rental_history');
    if (res.headersSent) {
      return;
    }

    const parsed = rentalHistoryCreateSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios o hay datos inválidos',
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const rentalHistoryInput = parsed.data;
    const contractDurationMonths =
      rentalHistoryInput.contract_duration_months ??
      calculateCalendarMonthDifference(
        rentalHistoryInput.contract_start_date,
        rentalHistoryInput.contract_end_date
      );

    const insertPayload = {
      reported_by_user_id: reporterUserId,
      cedula_inquilino: rentalHistoryInput.cedula_inquilino,
      tenant_id: rentalHistoryInput.tenant_id ?? null,

      lessor_name: rentalHistoryInput.lessor_name ?? null,
      lessor_contact: rentalHistoryInput.lessor_contact ?? null,
      lessor_document: rentalHistoryInput.lessor_document ?? null,

      city: rentalHistoryInput.city ?? null,
      property_type: rentalHistoryInput.property_type ?? null,

      contract_start_date: rentalHistoryInput.contract_start_date ?? null,
      contract_end_date: rentalHistoryInput.contract_end_date ?? null,
      contract_duration_months: contractDurationMonths,

      monthly_rent_amount: rentalHistoryInput.monthly_rent_amount ?? null,
      deposit_amount: rentalHistoryInput.deposit_amount ?? null,

      had_late_payments: rentalHistoryInput.had_late_payments ?? null,
      late_payment_months: rentalHistoryInput.late_payment_months ?? null,

      had_property_damage: rentalHistoryInput.had_property_damage ?? null,
      property_damage_notes: rentalHistoryInput.property_damage_notes ?? null,

      formal_handover: rentalHistoryInput.formal_handover ?? null,
      had_debt_at_handover: rentalHistoryInput.had_debt_at_handover ?? null,
      debt_amount: rentalHistoryInput.debt_amount ?? null,

      has_supporting_documents: rentalHistoryInput.has_supporting_documents ?? false,
      metadata: rentalHistoryInput.metadata,

      status: 'pending_admin_verification',
      tenant_consent_status: 'pending',
      score_impact_enabled: false,
      visibility_level: 'paid_only',
      currency: 'COP',
    };

    console.error('[RENTAL_HISTORY_INSERT_PAYLOAD]', insertPayload);

    const { data: rentalHistory, error } = await supabase
      .from('tenant_rental_histories')
      .insert(insertPayload)
      .select(
        [
          'id',
          'tenant_id',
          'reported_by_user_id',
          'cedula_inquilino',
          'lessor_name',
          'lessor_contact',
          'lessor_document',
          'city',
          'property_type',
          'contract_start_date',
          'contract_end_date',
          'contract_duration_months',
          'monthly_rent_amount',
          'currency',
          'deposit_amount',
          'had_late_payments',
          'late_payment_months',
          'had_property_damage',
          'property_damage_notes',
          'formal_handover',
          'had_debt_at_handover',
          'debt_amount',
          'has_supporting_documents',
          'tenant_consent_status',
          'status',
          'score_impact_enabled',
          'visibility_level',
          'metadata',
          'created_at',
          'updated_at',
        ].join(', ')
      )
      .single();

    if (error || !rentalHistory) {
      throw error || new Error('No se pudo crear el historial arrendaticio');
    }

    res.status(201).json({
      success: true,
      message: 'Historial arrendaticio enviado para verificaci\u00f3n',
      rental_history: rentalHistory,
    });
  } catch (error) {
    const dbError = error as { message?: string; code?: string };
    console.error('[RENTAL_HISTORY_CREATE_ERROR]', {
      message: dbError?.message,
      code: dbError?.code,
    });
    res.status(500).json({
      success: false,
      error: 'No se pudo guardar el historial en este momento',
    });
  }
});

// ================================
// ADMIN ROUTES
// ================================

async function safeCount(
  label: string,
  query: PromiseLike<{ count: number | null; error: any }>
): Promise<number> {
  try {
    const { count, error } = await query;

    if (error) {
      throw error;
    }

    return count || 0;
  } catch (err) {
    console.error(`[AdminMetrics] ${label} falló:`, err);
    return 0;
  }
}

async function countPendingIdentityVerificationDocuments(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('secure_documents' as any)
      .select('metadata')
      .eq('document_category', 'identity_document');

    if (error) {
      throw error;
    }

    return ((data || []) as Array<{ metadata?: Record<string, unknown> | null }>).filter((document) => {
      const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata : {};
      const identityMetadata =
        metadata.identity_verification && typeof metadata.identity_verification === 'object'
          ? (metadata.identity_verification as Record<string, unknown>)
          : {};

      return (identityMetadata.review_status || 'pending') === 'pending';
    }).length;
  } catch (err) {
    console.error('[AdminMetrics] identity_verifications_pending fallÃ³:', err);
    return 0;
  }
}

function getSettledNumber(result: PromiseSettledResult<number>): number {
  return result.status === 'fulfilled' && Number.isFinite(result.value) ? result.value : 0;
}

function roundPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function getSupabaseErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : null;
}

function getSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || 'unknown');
  }

  return 'unknown';
}

function getSupabaseErrorDetails(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = (error as { details?: unknown }).details;
    return details ? String(details) : null;
  }

  return null;
}

function getSupabaseErrorHint(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'hint' in error) {
    const hint = (error as { hint?: unknown }).hint;
    return hint ? String(hint) : null;
  }

  return null;
}

function sanitizeStoragePathForLog(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('/').filter(Boolean);
  const lastPart = parts.at(-1) || 'unknown';
  return parts.length > 1 ? `.../${lastPart}` : lastPart;
}

function buildSupabaseErrorLog(error: unknown) {
  return {
    supabase_error_code: getSupabaseErrorCode(error),
    supabase_error_message: getSupabaseErrorMessage(error),
    supabase_error_details: getSupabaseErrorDetails(error),
    supabase_error_hint: getSupabaseErrorHint(error),
  };
}

function isMissingSchemaError(error: unknown): boolean {
  const code = getSupabaseErrorCode(error);
  const message = getSupabaseErrorMessage(error).toLowerCase();

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST200' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache') ||
    message.includes('relationship')
  );
}

function logAdminEndpointError(input: {
  endpoint: string;
  table: string;
  operation: string;
  error: unknown;
  level?: 'warn' | 'error';
}) {
  const payload = {
    endpoint: input.endpoint,
    table: input.table,
    operation: input.operation,
    supabase_error_code: getSupabaseErrorCode(input.error),
    supabase_error_message: getSupabaseErrorMessage(input.error),
  };

  if (input.level === 'warn') {
    console.warn('[ADMIN_ENDPOINT_WARNING]', payload);
    return;
  }

  console.error('[ADMIN_ENDPOINT_ERROR]', payload);
}

function buildAdminPagination(page: number, pageSize: number, total = 0) {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

function sendAdminEmptyList(
  res: Response,
  input: {
    endpoint: string;
    table: string;
    operation: string;
    error: unknown;
    body: Record<string, unknown>;
  }
) {
  logAdminEndpointError({
    endpoint: input.endpoint,
    table: input.table,
    operation: input.operation,
    error: input.error,
    level: 'warn',
  });

  res.json({
    success: true,
    ...input.body,
  });
}

function sendAdminMigrationRequired(
  res: Response,
  input: {
    endpoint: string;
    table: string;
    operation: string;
    error: unknown;
    message: string;
  }
) {
  logAdminEndpointError(input);
  res.status(503).json({
    success: false,
    code: 'MIGRATION_REQUIRED',
    message: input.message,
  });
}

function getManualPlanLimit(planType: AdminUserPlan): number | null {
  switch (planType) {
    case 'free':
      return 3;
    case 'basic':
      return 8;
    case 'pro':
      return 30;
    case 'admin':
      return null;
  }
}

function getWompiReconcilePlanLimit(planType: string): number | null {
  switch (planType) {
    case 'basic':
      return 8;
    case 'pro':
      return 30;
    default:
      return null;
  }
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeOptionalFilter(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function parseOptionalBooleanFilter(value: unknown): boolean | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return null;
}

function getEmbeddedUserEmail(
  users: AdminWompiPaymentRow['users']
): string | null {
  if (!users) {
    return null;
  }

  const user = Array.isArray(users) ? users[0] : users;
  return typeof user?.email === 'string' ? user.email : null;
}

async function updateUserForWompiReconciliation(
  userId: string,
  planType: string,
  dailySearchLimit: number,
  nowISO: string
): Promise<void> {
  const updateAttempts: Record<string, unknown>[] = [
    {
      plan_type: planType,
      daily_search_limit: dailySearchLimit,
      searches_used_today: 0,
      last_search_reset: nowISO,
      updated_at: nowISO,
    },
    {
      plan_type: planType,
      daily_search_limit: dailySearchLimit,
      searches_used_today: 0,
      last_search_reset: nowISO,
    },
    {
      plan_type: planType,
      daily_search_limit: dailySearchLimit,
    },
  ];

  let lastError: unknown = null;

  for (const updatePayload of updateAttempts) {
    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId);

    if (!error) {
      return;
    }

    lastError = error;
  }

  throw lastError || new Error('No se pudo actualizar el usuario');
}

app.get(
  '/api/admin/mfa/status',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const adminUserId = req.user?.id;

      if (!adminUserId) {
        res.status(401).json({ success: false, message: 'Usuario admin no autenticado' });
        return;
      }

      const mfaState = await getAdminMfaState(adminUserId);

      if (!mfaState) {
        res.status(404).json({ success: false, message: 'Usuario admin no encontrado' });
        return;
      }

      res.json({
        success: true,
        mfa_enabled: Boolean(mfaState.mfa_enabled),
        mfa_last_verified_at: mfaState.mfa_last_verified_at,
        recent_mfa_valid: isRecentMfaValid(mfaState.mfa_last_verified_at),
        backup_codes_remaining: Array.isArray(mfaState.mfa_backup_codes_hash)
          ? mfaState.mfa_backup_codes_hash.length
          : 0,
      });
    } catch (error) {
      console.error('[ADMIN_MFA]', {
        action: 'status_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({ success: false, message: 'No se pudo cargar estado MFA' });
    }
  }
);

app.post(
  '/api/admin/mfa/setup',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      const adminEmail = req.user?.email;

      if (!adminUserId || !adminEmail) {
        res.status(401).json({ success: false, message: 'Usuario admin no autenticado' });
        return;
      }

      const secret = generateTotpSecret(adminEmail);
      const encryptedSecret = encryptMfaSecret(secret);
      const otpauthUri = buildOtpauthUri(adminEmail, secret);

      const { error } = await supabase
        .from('users')
        .update({
          mfa_secret_encrypted: encryptedSecret,
          mfa_enabled: false,
          mfa_enabled_at: null,
          mfa_last_verified_at: null,
          mfa_backup_codes_hash: null,
        })
        .eq('id', adminUserId);

      if (error) {
        throw error;
      }

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: 'mfa_setup_started',
        severity: 'medium',
        target: {
          type: 'user',
          id: adminUserId,
          reference: adminEmail,
        },
        new_state: {
          mfa_enabled: false,
          setup_started: true,
        },
        reason: 'Admin MFA setup started',
      });

      res.json({
        success: true,
        otpauth_uri: otpauthUri,
        qr_payload: otpauthUri,
      });
    } catch (error) {
      console.error('[ADMIN_MFA]', {
        action: 'setup_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(503).json({
        success: false,
        message: 'No se pudo iniciar MFA administrativo',
      });
    }
  }
);

app.post(
  '/api/admin/mfa/verify',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      const parsed = adminMfaTokenSchema.safeParse(req.body ?? {});

      if (!adminUserId) {
        res.status(401).json({ success: false, message: 'Usuario admin no autenticado' });
        return;
      }

      if (!parsed.success || !parsed.data.token) {
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'invalid_payload',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(400).json({ success: false, message: 'Codigo MFA invalido' });
        return;
      }

      const mfaState = await getAdminMfaState(adminUserId);

      if (!mfaState?.mfa_secret_encrypted) {
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: mfaState?.email || req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'mfa_setup_not_started',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(409).json({ success: false, message: 'Setup MFA no iniciado' });
        return;
      }

      const secret = decryptMfaSecret(mfaState.mfa_secret_encrypted);

      if (!verifyTotpToken(secret, parsed.data.token)) {
        await logAdminAction({
          ...buildAdminAuditContext(req),
          action_type: 'mfa_failed',
          severity: 'medium',
          target: { type: 'user', id: adminUserId, reference: mfaState.email || req.user?.email },
          reason: 'Invalid TOTP during MFA enablement',
        });
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: mfaState.email || req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'invalid_totp_enablement',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(401).json({ success: false, message: 'Codigo MFA invalido' });
        return;
      }

      const backupCodes = generateBackupCodes();
      const backupCodeHashes = await Promise.all(backupCodes.map((code) => hashBackupCode(code)));
      const nowISO = new Date().toISOString();

      const { error } = await supabase
        .from('users')
        .update({
          mfa_enabled: true,
          mfa_enabled_at: nowISO,
          mfa_last_verified_at: nowISO,
          mfa_backup_codes_hash: backupCodeHashes,
        })
        .eq('id', adminUserId);

      if (error) {
        throw error;
      }

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: 'mfa_enabled',
        severity: 'high',
        target: { type: 'user', id: adminUserId, reference: mfaState.email || req.user?.email },
        new_state: {
          mfa_enabled: true,
          mfa_enabled_at: nowISO,
          backup_codes_count: backupCodeHashes.length,
        },
        reason: 'Admin MFA enabled',
      });

      await logAuthenticationAudit({
        user_id: adminUserId,
        email: mfaState.email || req.user?.email || null,
        event_type: 'mfa.success',
        event_status: 'success',
        request: buildAuthenticationAuditRequest(req),
      });

      res.json({
        success: true,
        backup_codes: backupCodes,
        mfa_enabled: true,
        mfa_last_verified_at: nowISO,
      });
    } catch (error) {
      console.error('[ADMIN_MFA]', {
        action: 'verify_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(503).json({ success: false, message: 'No se pudo verificar MFA' });
    }
  }
);

app.post(
  '/api/admin/mfa/challenge',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      const parsed = adminMfaTokenSchema.safeParse(req.body ?? {});

      if (!adminUserId) {
        res.status(401).json({ success: false, message: 'Usuario admin no autenticado' });
        return;
      }

      if (!parsed.success) {
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'invalid_payload',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(400).json({ success: false, message: 'Codigo MFA invalido' });
        return;
      }

      const mfaState = await getAdminMfaState(adminUserId);

      if (!mfaState?.mfa_enabled) {
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: mfaState?.email || req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'mfa_not_configured',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(403).json({ success: false, message: 'MFA no configurado' });
        return;
      }

      const verification = await verifyAdminMfaCredential({
        user: mfaState,
        token: parsed.data.token,
        backupCode: parsed.data.backup_code,
      });

      if (!verification.valid) {
        await logAdminAction({
          ...buildAdminAuditContext(req),
          action_type: 'mfa_failed',
          severity: 'medium',
          target: { type: 'user', id: adminUserId, reference: mfaState.email || req.user?.email },
          reason: 'Invalid MFA challenge',
        });
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: mfaState.email || req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'invalid_mfa_challenge',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(401).json({ success: false, message: 'Codigo MFA invalido' });
        return;
      }

      const nowISO = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        mfa_last_verified_at: nowISO,
      };
      let backupCodesRemaining = Array.isArray(mfaState.mfa_backup_codes_hash)
        ? mfaState.mfa_backup_codes_hash.length
        : 0;

      if (verification.usedBackupCode && verification.backupCodeIndex !== null) {
        const nextHashes = [...(mfaState.mfa_backup_codes_hash || [])];
        nextHashes.splice(verification.backupCodeIndex, 1);
        updatePayload.mfa_backup_codes_hash = nextHashes;
        backupCodesRemaining = nextHashes.length;
      }

      const { error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', adminUserId);

      if (error) {
        throw error;
      }

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: verification.usedBackupCode ? 'backup_code_used' : 'mfa_verified',
        severity: verification.usedBackupCode ? 'high' : 'medium',
        target: { type: 'user', id: adminUserId, reference: mfaState.email || req.user?.email },
        new_state: {
          mfa_last_verified_at: nowISO,
          backup_codes_remaining: backupCodesRemaining,
        },
        reason: verification.usedBackupCode
          ? 'Admin MFA backup code used'
          : 'Admin MFA challenge verified',
      });

      await logAuthenticationAudit({
        user_id: adminUserId,
        email: mfaState.email || req.user?.email || null,
        event_type: 'mfa.success',
        event_status: 'success',
        request: buildAuthenticationAuditRequest(req),
      });

      res.json({
        success: true,
        mfa_last_verified_at: nowISO,
        recent_mfa_valid: true,
        backup_codes_remaining: backupCodesRemaining,
      });
    } catch (error) {
      console.error('[ADMIN_MFA]', {
        action: 'challenge_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(503).json({ success: false, message: 'No se pudo validar MFA' });
    }
  }
);

app.post(
  '/api/admin/mfa/disable',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const adminUserId = req.user?.id;
      const parsed = adminMfaTokenSchema.safeParse(req.body ?? {});

      if (!adminUserId) {
        res.status(401).json({ success: false, message: 'Usuario admin no autenticado' });
        return;
      }

      const mfaState = await getAdminMfaState(adminUserId);

      if (!mfaState?.mfa_enabled) {
        res.status(409).json({ success: false, message: 'MFA no esta habilitado' });
        return;
      }

      let authorized = isRecentMfaValid(mfaState.mfa_last_verified_at);

      if (!authorized && parsed.success) {
        const verification = await verifyAdminMfaCredential({
          user: mfaState,
          token: parsed.data.token,
          backupCode: parsed.data.backup_code,
        });
        authorized = verification.valid;
      }

      if (!authorized) {
        await logAdminAction({
          ...buildAdminAuditContext(req),
          action_type: 'mfa_failed',
          severity: 'medium',
          target: { type: 'user', id: adminUserId, reference: mfaState.email || req.user?.email },
          reason: 'Invalid MFA disable attempt',
        });
        await logAuthenticationAudit({
          user_id: adminUserId,
          email: mfaState.email || req.user?.email || null,
          event_type: 'mfa.failed',
          event_status: 'failed',
          failure_reason: 'invalid_mfa_disable_attempt',
          request: buildAuthenticationAuditRequest(req),
        });
        res.status(403).json({ success: false, message: 'Verificacion MFA requerida' });
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({
          mfa_enabled: false,
          mfa_secret_encrypted: null,
          mfa_enabled_at: null,
          mfa_last_verified_at: null,
          mfa_backup_codes_hash: null,
        })
        .eq('id', adminUserId);

      if (error) {
        throw error;
      }

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: 'mfa_disabled',
        severity: 'critical',
        target: { type: 'user', id: adminUserId, reference: mfaState.email || req.user?.email },
        previous_state: {
          mfa_enabled: true,
        },
        new_state: {
          mfa_enabled: false,
        },
        reason: 'Admin MFA disabled',
      });

      res.json({ success: true, mfa_enabled: false });
    } catch (error) {
      console.error('[ADMIN_MFA]', {
        action: 'disable_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(503).json({ success: false, message: 'No se pudo deshabilitar MFA' });
    }
  }
);

async function countUniqueSearchUsersSince(sinceISO: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('search_logs')
      .select('user_id')
      .gte('created_at', sinceISO)
      .not('user_id', 'is', null)
      .limit(10000);

    if (error) {
      throw error;
    }

    return new Set((data || []).map((row) => row.user_id).filter(Boolean)).size;
  } catch (err) {
    console.error('[AdminMetrics] unique_search_users_7d falló:', err);
    return 0;
  }
}

app.get(
  '/api/admin/users',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, tipo_usuario, plan_type, daily_search_limit, fecha_registro')
        .order('fecha_registro', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      const users = (data || []).map((user) => ({
        id: user.id,
        email: user.email,
        tipo_usuario: user.tipo_usuario,
        plan_type: user.plan_type,
        daily_search_limit: user.daily_search_limit,
        created_at: user.fecha_registro,
      }));

      res.json({
        success: true,
        users,
      });
    } catch (err: any) {
      console.error('[ADMIN_USERS_ERROR]', err);
      res.status(500).json({
        success: false,
        message: 'No se pudieron cargar los usuarios',
      });
    }
  }
);

app.patch(
  '/api/admin/users/:userId/plan',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    const validPlans: AdminUserPlan[] = ['free', 'basic', 'pro', 'admin'];
    const { userId } = req.params;
    const planType = String(req.body?.plan_type || '') as AdminUserPlan;

    if (!validPlans.includes(planType)) {
      res.status(400).json({
        success: false,
        message: 'Plan inválido',
      });
      return;
    }

    if (req.user?.id === userId && planType !== 'admin') {
      res.status(400).json({
        success: false,
        message: 'No puedes degradar tu propio plan de administrador',
      });
      return;
    }

    let dailySearchLimit = getManualPlanLimit(planType);
    const overrideLimit = req.body?.daily_search_limit;

    if (
      planType !== 'admin' &&
      typeof overrideLimit === 'number' &&
      Number.isFinite(overrideLimit) &&
      overrideLimit >= 0
    ) {
      dailySearchLimit = overrideLimit;
    }

    try {
      const { data: currentUser, error: currentUserError } = await supabase
        .from('users')
        .select('id, plan_type, daily_search_limit')
        .eq('id', userId)
        .maybeSingle();

      if (currentUserError) {
        throw currentUserError;
      }

      if (!currentUser) {
        res.status(404).json({
          success: false,
          message: 'Usuario no encontrado',
        });
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          plan_type: planType,
          daily_search_limit: dailySearchLimit,
        })
        .eq('id', userId)
        .select('id, email, tipo_usuario, plan_type, daily_search_limit, fecha_registro')
        .single();

      if (error) {
        throw error;
      }

      const { error: planChangeLogError } = await supabase
        .from('plan_change_logs')
        .insert({
          admin_user_id: req.user?.id || null,
          target_user_id: userId,
          previous_plan_type: currentUser.plan_type,
          new_plan_type: planType,
          previous_daily_search_limit: currentUser.daily_search_limit,
          new_daily_search_limit: dailySearchLimit,
          reason: 'manual_admin_update',
          payment_id: null,
          payment_reference: null,
          payment_provider: null,
          metadata: {
            source: 'admin_panel',
          },
        });

      if (planChangeLogError) {
        console.error('[ADMIN_PLAN_CHANGE_LOG_ERROR]', planChangeLogError);
      }

      res.json({
        success: true,
        user: {
          id: data.id,
          email: data.email,
          tipo_usuario: data.tipo_usuario,
          plan_type: data.plan_type,
          daily_search_limit: data.daily_search_limit,
          created_at: data.fecha_registro,
        },
      });
    } catch (err: any) {
      console.error('[ADMIN_USERS_ERROR]', err?.message || err);
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar el plan',
      });
    }
  }
);

app.get(
  '/api/admin/plan-change-logs',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 50), 1, 100);
      const reasonFilter = normalizeOptionalFilter(req.query.reason, 80);
      const previousPlanFilter = normalizeOptionalFilter(req.query.previous_plan, 40);
      const newPlanFilter = normalizeOptionalFilter(req.query.new_plan, 40);
      const userEmailFilter = normalizeOptionalFilter(req.query.user_email, 160)?.toLowerCase() || null;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let targetUserIdsForEmail: string[] | null = null;

      if (userEmailFilter) {
        const { data: matchingUsers, error: matchingUsersError } = await supabase
          .from('users')
          .select('id')
          .ilike('email', `%${userEmailFilter}%`)
          .limit(100);

        if (matchingUsersError) {
          throw matchingUsersError;
        }

        targetUserIdsForEmail = (matchingUsers || []).map((user) => user.id);

        if (targetUserIdsForEmail.length === 0) {
          res.json({
            success: true,
            logs: [],
            pagination: {
              page,
              pageSize,
              total: 0,
              totalPages: 0,
            },
          });
          return;
        }
      }

      let query = supabase
        .from('plan_change_logs')
        .select(`
          id,
          admin_user_id,
          target_user_id,
          previous_plan_type,
          new_plan_type,
          previous_daily_search_limit,
          new_daily_search_limit,
          reason,
          payment_id,
          payment_reference,
          payment_provider,
          created_at
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (reasonFilter) {
        query = query.ilike('reason', `%${reasonFilter}%`);
      }

      if (previousPlanFilter) {
        query = query.eq('previous_plan_type', previousPlanFilter);
      }

      if (newPlanFilter) {
        query = query.eq('new_plan_type', newPlanFilter);
      }

      if (targetUserIdsForEmail) {
        query = query.in('target_user_id', targetUserIdsForEmail);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const logs = (data || []) as AdminPlanChangeLogRow[];
      const userIds = Array.from(
        new Set(
          logs
            .flatMap((log) => [log.admin_user_id, log.target_user_id])
            .filter((id): id is string => Boolean(id))
        )
      );
      let usersById: Record<string, AdminReporterUser> = {};

      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, nombre, email, tipo_usuario')
          .in('id', userIds);

        if (usersError) {
          throw usersError;
        }

        usersById = (users || []).reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {} as Record<string, AdminReporterUser>);
      }

      const enrichedLogs: AdminPlanChangeLogResponseRow[] = logs.map((log) => ({
        ...log,
        admin_user: log.admin_user_id ? usersById[log.admin_user_id] || null : null,
        target_user: log.target_user_id ? usersById[log.target_user_id] || null : null,
      }));
      const total = count ?? 0;

      res.json({
        success: true,
        logs: enrichedLogs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
        },
      });
    } catch (err: any) {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 50), 1, 100);

      if (isMissingSchemaError(err)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/plan-change-logs',
          table: 'plan_change_logs',
          operation: 'select',
          error: err,
          body: {
            logs: [],
            pagination: buildAdminPagination(page, pageSize),
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/plan-change-logs',
        table: 'plan_change_logs',
        operation: 'select',
        error: err,
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo cargar el historial de cambios de plan',
      });
    }
  }
);

app.get(
  '/api/admin/rental-histories',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const filters = {
        status: 'pending_admin_verification',
        tenant_consent_status: 'pending',
      };

      const { data, error, count } = await supabase
        .from('tenant_rental_histories')
        .select(`
          id,
          tenant_id,
          reported_by_user_id,
          cedula_inquilino,
          lessor_name,
          lessor_contact,
          lessor_document,
          city,
          property_type,
          contract_start_date,
          contract_end_date,
          contract_duration_months,
          monthly_rent_amount,
          currency,
          deposit_amount,
          had_late_payments,
          late_payment_months,
          had_property_damage,
          property_damage_notes,
          formal_handover,
          had_debt_at_handover,
          debt_amount,
          has_supporting_documents,
          tenant_consent_status,
          status,
          verification_notes,
          verified_by_admin_id,
          verified_at,
          rejected_by_admin_id,
          rejected_at,
          rejection_reason,
          dispute_status,
          dispute_notes,
          score_impact_enabled,
          visibility_level,
          created_at,
          updated_at
        `, { count: 'exact' })
        .eq('status', filters.status)
        .eq('tenant_consent_status', filters.tenant_consent_status)
        .order('created_at', { ascending: false })
        .limit(100);

      console.error('[RENTAL_HISTORY_ADMIN_LIST]', {
        filters,
        count,
        error: error
          ? {
              code: error.code,
              message: error.message,
            }
          : null,
      });

      if (error) {
        throw error;
      }

      const rentalHistories = (data || []).map((history) => ({
        ...history,
        subject_type: 'natural_person',
        subject_document_type: 'CC',
        subject_document_number: history.cedula_inquilino,
        source_type: null,
      }));

      res.json({
        success: true,
        rental_histories: rentalHistories,
      });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/rental-histories',
          table: 'tenant_rental_histories',
          operation: 'select',
          error,
          body: {
            rental_histories: [],
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/rental-histories',
        table: 'tenant_rental_histories',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
      });
    }
  }
);

app.patch(
  '/api/admin/rental-histories/:id/status',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const adminUserId = req.user?.id;
      const status = String(req.body?.status || '') as AdminRentalHistoryStatus;
      const notes =
        typeof req.body?.notes === 'string' && req.body.notes.trim()
          ? req.body.notes.trim().slice(0, 500)
          : null;

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      if (!['verified', 'rejected', 'disputed'].includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Estado invÃ¡lido',
        });
        return;
      }

      const { data: existingRentalHistory, error: existingError } = await supabase
        .from('tenant_rental_histories')
        .select('id, status, reported_by_user_id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingRentalHistory) {
        res.status(404).json({
          success: false,
          message: 'Historial arrendaticio no encontrado',
        });
        return;
      }

      const nowISO = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        status,
      };

      if (status === 'verified') {
        updatePayload.updated_at = nowISO;
        updatePayload.score_impact_enabled = false;
        updatePayload.verified_by_admin_id = adminUserId;
        updatePayload.verified_at = nowISO;
        updatePayload.verification_notes = notes;
        updatePayload.rejected_by_admin_id = null;
        updatePayload.rejected_at = null;
        updatePayload.rejection_reason = null;
      }

      if (status === 'rejected') {
        updatePayload.rejected_by_admin_id = adminUserId;
        updatePayload.rejected_at = nowISO;
        updatePayload.rejection_reason = notes || 'Rechazado por revisión administrativa';
      }

      if (status === 'disputed') {
        updatePayload.updated_at = nowISO;
        updatePayload.score_impact_enabled = false;
        updatePayload.dispute_status = 'opened';
        updatePayload.disputed_at = nowISO;
        updatePayload.dispute_notes = notes;
      }

      const { data: rentalHistory, error: updateError } = await supabase
        .from('tenant_rental_histories')
        .update(updatePayload)
        .eq('id', id)
        .select(`
          id,
          tenant_id,
          reported_by_user_id,
          cedula_inquilino,
          lessor_name,
          lessor_contact,
          lessor_document,
          city,
          property_type,
          contract_start_date,
          contract_end_date,
          contract_duration_months,
          monthly_rent_amount,
          currency,
          deposit_amount,
          had_late_payments,
          late_payment_months,
          had_property_damage,
          property_damage_notes,
          formal_handover,
          had_debt_at_handover,
          debt_amount,
          has_supporting_documents,
          tenant_consent_status,
          status,
          verification_notes,
          rejected_by_admin_id,
          rejected_at,
          rejection_reason,
          dispute_status,
          dispute_notes,
          score_impact_enabled,
          visibility_level,
          created_at,
          updated_at
        `)
        .single();

      if (updateError || !rentalHistory) {
        if (status === 'rejected') {
          console.error('[RENTAL_HISTORY_ADMIN_REJECT_ERROR]', {
            rental_history_id: id,
            admin_user_id: adminUserId,
            attempted_update: updatePayload,
            supabase_error: updateError,
            supabase_error_log: updateError ? buildSupabaseErrorLog(updateError) : null,
          });
        }
        throw updateError || new Error('No se pudo actualizar el historial arrendaticio');
      }

      const rentalHistoryResponse = {
        ...rentalHistory,
        subject_type: 'natural_person',
        subject_document_type: 'CC',
        subject_document_number: rentalHistory.cedula_inquilino,
        source_type: null,
      };

      if (status === 'verified' || status === 'rejected') {
        const action = status === 'verified' ? 'rental_history_verified' : 'rental_history_rejected';
        const { error: rentalHistoryActionError } = await supabase
          .from('admin_report_actions')
          .insert({
            rental_history_id: id,
            admin_user_id: adminUserId,
            action,
            timestamp: nowISO,
            accion: status === 'verified' ? 'aprobado' : 'rechazado',
            fecha_accion: nowISO,
          });

        if (rentalHistoryActionError) {
          console.error('[RENTAL_HISTORY_ADMIN_ACTION_ERROR]', {
            rental_history_id: id,
            admin_user_id: adminUserId,
            action,
            supabase_error: rentalHistoryActionError,
            supabase_error_log: buildSupabaseErrorLog(rentalHistoryActionError),
          });
          throw rentalHistoryActionError;
        }
      }

      let creditGrant: SearchCreditGrantResult = {
        granted: false,
        reason: 'not_applicable',
      };

      if (
        status === 'verified' &&
        existingRentalHistory.status !== 'verified' &&
        existingRentalHistory.reported_by_user_id
      ) {
        creditGrant = await grantRentalHistoryVerifiedSearchCredit({
          userId: existingRentalHistory.reported_by_user_id,
          rentalHistoryId: existingRentalHistory.id,
          adminUserId,
        });
      }

      res.json({
        success: true,
        rental_history: rentalHistoryResponse,
        credit_grant: creditGrant,
      });
    } catch (error) {
      if (String(req.body?.status || '') === 'rejected') {
        console.error('[RENTAL_HISTORY_ADMIN_REJECT_ERROR]', {
          rental_history_id: req.params.id,
          admin_user_id: req.user?.id || null,
          supabase_error: error,
          supabase_error_log: buildSupabaseErrorLog(error),
        });
      }
      console.error('[ADMIN_RENTAL_HISTORY_STATUS_ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
      });
    }
  }
);

app.get(
  '/api/admin/wompi-payments',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const allowedStatuses = new Set([
      'created',
      'pending',
      'approved',
      'declined',
      'voided',
      'error',
      'failed',
    ]);
    const allowedPlans = new Set(['basic', 'pro']);

    const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
    const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
    const statusFilter = normalizeOptionalFilter(req.query.status, 40)?.toLowerCase() || null;
    const planFilter = normalizeOptionalFilter(req.query.plan_type, 20)?.toLowerCase() || null;
    const referenceFilter = normalizeOptionalFilter(req.query.reference, 160);
    const userEmailFilter = normalizeOptionalFilter(req.query.user_email, 160)?.toLowerCase() || null;

    if (statusFilter && !allowedStatuses.has(statusFilter)) {
      res.status(400).json({
        success: false,
        message: 'Estado de pago invÃ¡lido',
      });
      return;
    }

    if (planFilter && !allowedPlans.has(planFilter)) {
      res.status(400).json({
        success: false,
        message: 'Plan invÃ¡lido',
      });
      return;
    }

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const userProjection = userEmailFilter ? 'users!inner(email)' : 'users(email)';

      let query = supabase
        .from('wompi_payments')
        .select(
          `
          id,
          user_id,
          plan_type,
          amount_in_cents,
          currency,
          reference,
          status,
          wompi_status,
          wompi_transaction_id,
          created_at,
          updated_at,
          processed_at,
          ${userProjection}
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      if (planFilter) {
        query = query.eq('plan_type', planFilter);
      }

      if (referenceFilter) {
        query = query.ilike('reference', `%${referenceFilter}%`);
      }

      if (userEmailFilter) {
        query = query.ilike('users.email', `%${userEmailFilter}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const rows = (data || []) as AdminWompiPaymentRow[];
      const payments: AdminWompiPaymentResponseRow[] = rows.map((payment) => ({
        payment_id: payment.id,
        user_id: payment.user_id,
        user_email: getEmbeddedUserEmail(payment.users),
        plan_type: payment.plan_type,
        amount_in_cents: payment.amount_in_cents,
        currency: payment.currency,
        reference: payment.reference,
        internal_status: payment.status,
        wompi_status: payment.wompi_status,
        wompi_transaction_id: payment.wompi_transaction_id,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        processed_at: payment.processed_at,
      }));

      const total = count ?? 0;
      const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

      console.log('[ADMIN_WOMPI_PAYMENTS]', {
        page,
        pageSize,
        total,
        hasStatusFilter: Boolean(statusFilter),
        hasPlanFilter: Boolean(planFilter),
        hasReferenceFilter: Boolean(referenceFilter),
        hasUserEmailFilter: Boolean(userEmailFilter),
      });

      res.json({
        success: true,
        data: payments,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      });
    } catch (err: any) {
      console.error('[ADMIN_WOMPI_PAYMENTS]', {
        error: err?.message || 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo cargar el historial de pagos Wompi',
      });
    }
  }
);

app.post(
  '/api/admin/wompi-payments/:paymentId/verify',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { paymentId } = req.params;

    try {
      const { data: payment, error: paymentError } = await supabase
        .from('wompi_payments')
        .select(`
          id,
          reference,
          status,
          wompi_transaction_id,
          amount_in_cents,
          currency
        `)
        .eq('id', paymentId)
        .maybeSingle();

      if (paymentError) {
        throw paymentError;
      }

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Pago Wompi no encontrado',
        });
        return;
      }

      const existingPayment = payment as AdminWompiVerifyPaymentRow;

      if (!existingPayment.wompi_transaction_id) {
        console.log('[ADMIN_WOMPI_VERIFY]', {
          paymentId: existingPayment.id,
          result: 'missing_transaction_id',
        });

        res.status(409).json({
          success: false,
          message:
            'Este pago no tiene wompi_transaction_id; no se puede verificar por ID todavia.',
        });
        return;
      }

      const transaction = await getWompiTransactionById(existingPayment.wompi_transaction_id);
      const transactionIdMatches = transaction.id === existingPayment.wompi_transaction_id;
      const referenceMatches =
        !transaction.reference || transaction.reference === existingPayment.reference;
      const amountMatches =
        transaction.amount_in_cents === undefined ||
        transaction.amount_in_cents === existingPayment.amount_in_cents;
      const currencyMatches =
        !transaction.currency || transaction.currency === existingPayment.currency;
      const canUpdateStatus = transactionIdMatches && referenceMatches;

      if (canUpdateStatus) {
        const { error: updateError } = await supabase
          .from('wompi_payments')
          .update({
            wompi_status: transaction.status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPayment.id);

        if (updateError) {
          throw updateError;
        }
      }

      console.log('[ADMIN_WOMPI_VERIFY]', {
        paymentId: existingPayment.id,
        transactionIdMatches,
        referenceMatches,
        status: transaction.status,
      });

      res.json({
        success: true,
        data: {
          payment_id: existingPayment.id,
          reference: existingPayment.reference,
          internal_status: existingPayment.status,
          wompi_transaction_id: existingPayment.wompi_transaction_id,
          wompi_status_current: transaction.status,
          amount_in_cents: transaction.amount_in_cents,
          currency: transaction.currency,
          finalized_at: transaction.finalized_at ?? null,
          consistency_checks: {
            transaction_id_matches: transactionIdMatches,
            reference_matches: referenceMatches,
            amount_matches: amountMatches,
            currency_matches: currencyMatches,
          },
        },
      });
    } catch (err: any) {
      if (err instanceof WompiTransactionLookupError) {
        console.warn('[ADMIN_WOMPI_VERIFY]', {
          paymentId,
          errorCode: err.code,
          statusCode: err.statusCode,
        });

        res.status(err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502).json({
          success: false,
          message: 'No se pudo verificar la transaccion en Wompi',
        });
        return;
      }

      console.error('[ADMIN_WOMPI_VERIFY]', {
        paymentId,
        error: err?.message || 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo verificar el pago Wompi',
      });
    }
  }
);

app.post(
  '/api/admin/wompi-payments/:paymentId/reconcile',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    const { paymentId } = req.params;
    const adminUserId = req.user?.id || null;

    try {
      const { data: payment, error: paymentError } = await supabase
        .from('wompi_payments')
        .select(`
          id,
          user_id,
          plan_type,
          amount_in_cents,
          currency,
          reference,
          status,
          wompi_status,
          wompi_transaction_id,
          processed_at,
          updated_at
        `)
        .eq('id', paymentId)
        .maybeSingle();

      if (paymentError) {
        throw paymentError;
      }

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Pago Wompi no encontrado',
        });
        return;
      }

      const existingPayment = payment as AdminWompiReconcilePaymentRow;

      if (!existingPayment.wompi_transaction_id) {
        console.log('[ADMIN_WOMPI_RECONCILE]', {
          paymentId: existingPayment.id,
          result: 'missing_transaction_id',
        });

        res.status(409).json({
          success: false,
          message:
            'Este pago no tiene wompi_transaction_id; no se puede reconciliar por ID todavia.',
        });
        return;
      }

      if (existingPayment.status === 'approved' && existingPayment.processed_at) {
        res.status(200).json({
          success: true,
          data: {
            reconciled: false,
            already_processed: true,
            payment_id: existingPayment.id,
            user_id: existingPayment.user_id,
            plan_type: existingPayment.plan_type,
            daily_search_limit: getWompiReconcilePlanLimit(existingPayment.plan_type),
            wompi_status: existingPayment.wompi_status || 'APPROVED',
            audit_logged: false,
          },
        });
        return;
      }

      if (!existingPayment.user_id) {
        res.status(409).json({
          success: false,
          message: 'Este pago no tiene user_id asociado; no se puede activar un plan.',
        });
        return;
      }

      const dailySearchLimit = getWompiReconcilePlanLimit(existingPayment.plan_type);

      if (dailySearchLimit === null) {
        res.status(409).json({
          success: false,
          message: 'El plan del pago no es reconciliable automaticamente.',
        });
        return;
      }

      const transaction = await getWompiTransactionById(existingPayment.wompi_transaction_id);
      const consistencyChecks = {
        transaction_id_matches: transaction.id === existingPayment.wompi_transaction_id,
        reference_matches: transaction.reference === existingPayment.reference,
        status_approved: transaction.status.toUpperCase() === 'APPROVED',
        amount_matches:
          transaction.amount_in_cents === undefined ||
          transaction.amount_in_cents === existingPayment.amount_in_cents,
        currency_matches:
          !transaction.currency || transaction.currency === existingPayment.currency,
      };
      const failedChecks = Object.entries(consistencyChecks)
        .filter(([, passed]) => !passed)
        .map(([check]) => check);

      if (failedChecks.length > 0) {
        console.warn('[ADMIN_WOMPI_RECONCILE]', {
          paymentId: existingPayment.id,
          result: 'consistency_check_failed',
          failedChecks,
        });

        res.status(409).json({
          success: false,
          message: 'No se puede reconciliar: la transaccion Wompi no coincide con el pago interno.',
          data: {
            reconciled: false,
            payment_id: existingPayment.id,
            wompi_status: transaction.status,
            consistency_checks: consistencyChecks,
            failed_checks: failedChecks,
          },
        });
        return;
      }

      const { data: currentUser, error: currentUserError } = await supabase
        .from('users')
        .select('id, plan_type, daily_search_limit')
        .eq('id', existingPayment.user_id)
        .maybeSingle();

      if (currentUserError) {
        throw currentUserError;
      }

      if (!currentUser) {
        res.status(409).json({
          success: false,
          message: 'El usuario asociado al pago no existe; no se puede activar el plan.',
        });
        return;
      }

      const userBeforeUpdate = currentUser as AdminWompiReconcileUserRow;
      const nowISO = new Date().toISOString();

      await updateUserForWompiReconciliation(
        existingPayment.user_id,
        existingPayment.plan_type,
        dailySearchLimit,
        nowISO
      );

      const { data: processedPayment, error: processedPaymentError } = await supabase
        .from('wompi_payments')
        .update({
          status: 'approved',
          wompi_status: 'APPROVED',
          processed_at: nowISO,
          updated_at: nowISO,
        })
        .eq('id', existingPayment.id)
        .eq('wompi_transaction_id', existingPayment.wompi_transaction_id)
        .is('processed_at', null)
        .select('id, status, processed_at')
        .maybeSingle();

      if (processedPaymentError) {
        throw processedPaymentError;
      }

      if (!processedPayment) {
        console.log('[ADMIN_WOMPI_RECONCILE]', {
          paymentId: existingPayment.id,
          result: 'already_processed_after_user_update',
        });

        res.status(200).json({
          success: true,
          data: {
            reconciled: false,
            already_processed: true,
            payment_id: existingPayment.id,
            user_id: existingPayment.user_id,
            plan_type: existingPayment.plan_type,
            daily_search_limit: dailySearchLimit,
            wompi_status: 'APPROVED',
            audit_logged: false,
          },
        });
        return;
      }

      let auditLogged = true;
      const { error: auditError } = await supabase
        .from('plan_change_logs')
        .insert({
          admin_user_id: adminUserId,
          target_user_id: existingPayment.user_id,
          previous_plan_type: userBeforeUpdate.plan_type,
          new_plan_type: existingPayment.plan_type,
          previous_daily_search_limit: userBeforeUpdate.daily_search_limit,
          new_daily_search_limit: dailySearchLimit,
          reason: 'wompi_admin_manual_reconcile',
          payment_id: existingPayment.id,
          payment_reference: existingPayment.reference,
          payment_provider: 'wompi',
          metadata: {
            source: 'admin_wompi_reconcile',
            wompi_transaction_id: existingPayment.wompi_transaction_id,
          },
        });

      if (auditError) {
        auditLogged = false;
        console.warn('[ADMIN_WOMPI_RECONCILE]', {
          paymentId: existingPayment.id,
          result: 'audit_log_failed',
          error: auditError.message,
        });
      }

      console.log('[ADMIN_WOMPI_RECONCILE]', {
        paymentId: existingPayment.id,
        userId: existingPayment.user_id,
        planType: existingPayment.plan_type,
        result: 'reconciled',
        auditLogged,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: 'payment.reconcile',
        severity: 'high',
        target: {
          type: 'wompi_payment',
          id: existingPayment.id,
          reference: existingPayment.reference,
        },
        previous_state: {
          payment_status: existingPayment.status,
          wompi_status: existingPayment.wompi_status,
          processed_at: existingPayment.processed_at,
          user_id: existingPayment.user_id,
          user_plan_type: userBeforeUpdate.plan_type,
          user_daily_search_limit: userBeforeUpdate.daily_search_limit,
        },
        new_state: {
          payment_status: 'approved',
          wompi_status: 'APPROVED',
          processed_at: (processedPayment as { processed_at?: string | null }).processed_at || nowISO,
          user_id: existingPayment.user_id,
          user_plan_type: existingPayment.plan_type,
          user_daily_search_limit: dailySearchLimit,
          plan_change_log_written: auditLogged,
        },
        reason: 'wompi_admin_manual_reconcile',
      });

      res.json({
        success: true,
        data: {
          reconciled: true,
          payment_id: existingPayment.id,
          user_id: existingPayment.user_id,
          plan_type: existingPayment.plan_type,
          daily_search_limit: dailySearchLimit,
          wompi_status: 'APPROVED',
          audit_logged: auditLogged,
        },
      });
    } catch (err: any) {
      if (err instanceof WompiTransactionLookupError) {
        console.warn('[ADMIN_WOMPI_RECONCILE]', {
          paymentId,
          errorCode: err.code,
          statusCode: err.statusCode,
        });

        res.status(err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502).json({
          success: false,
          message: 'No se pudo consultar la transaccion en Wompi para reconciliar',
        });
        return;
      }

      console.error('[ADMIN_WOMPI_RECONCILE]', {
        paymentId,
        error: err?.message || 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo reconciliar el pago Wompi',
      });
    }
  }
);

app.get(
  '/api/admin/metrics',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    const now = new Date();
    const bogotaNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'America/Bogota' })
    );
    const startOfBogotaDay = new Date(bogotaNow);
    startOfBogotaDay.setHours(0, 0, 0, 0);

    const startOfTodayBogotaISO = startOfBogotaDay.toISOString();
    const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      searchesTodayResult,
      searches7dResult,
      uniqueSearchUsers7dResult,
      upgradeClicks7dResult,
      basicClicks7dResult,
      proClicks7dResult,
      enterpriseClicks7dResult,
      paymentsCreated7dResult,
      paymentsPending7dResult,
      paymentsApproved7dResult,
      paymentsFailed7dResult,
      usersFreeResult,
      usersBasicResult,
      usersProResult,
      usersAdminResult,
      identityVerificationsPendingResult,
      reportsPendingResult,
    ] = await Promise.allSettled([
      safeCount(
        'searches_today',
        supabase
          .from('search_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfTodayBogotaISO)
      ),
      safeCount(
        'searches_7d',
        supabase
          .from('search_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgoISO)
      ),
      countUniqueSearchUsersSince(sevenDaysAgoISO),
      safeCount(
        'upgrade_clicks_7d',
        supabase
          .from('upgrade_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'upgrade_cta_clicked')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'basic_clicks_7d',
        supabase
          .from('upgrade_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'plan_basic_clicked')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'pro_clicks_7d',
        supabase
          .from('upgrade_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'plan_pro_clicked')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'enterprise_clicks_7d',
        supabase
          .from('upgrade_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'enterprise_clicked')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'payments_created_7d',
        supabase
          .from('wompi_payments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'created')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'payments_pending_7d',
        supabase
          .from('wompi_payments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'payments_approved_7d',
        supabase
          .from('wompi_payments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'payments_failed_7d',
        supabase
          .from('wompi_payments')
          .select('id', { count: 'exact', head: true })
          .in('status', ['declined', 'voided', 'error', 'failed'])
          .gte('created_at', sevenDaysAgoISO)
      ),
      safeCount(
        'users_free',
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('plan_type', 'free')
      ),
      safeCount(
        'users_basic',
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('plan_type', 'basic')
      ),
      safeCount(
        'users_pro',
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('plan_type', 'pro')
      ),
      safeCount(
        'users_admin',
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('tipo_usuario', 'admin')
      ),
      countPendingIdentityVerificationDocuments(),
      safeCount(
        'reports_pending',
        applyAdminPendingReportsFilter(
          supabase
            .from('reports')
            .select('id', { count: 'exact', head: true })
        )
      ),
    ]);

    const searches_today = getSettledNumber(searchesTodayResult);
    const searches_7d = getSettledNumber(searches7dResult);
    const unique_search_users_7d = getSettledNumber(uniqueSearchUsers7dResult);
    const upgrade_clicks_7d = getSettledNumber(upgradeClicks7dResult);
    const basic_clicks_7d = getSettledNumber(basicClicks7dResult);
    const pro_clicks_7d = getSettledNumber(proClicks7dResult);
    const enterprise_clicks_7d = getSettledNumber(enterpriseClicks7dResult);
    const payments_created_7d = getSettledNumber(paymentsCreated7dResult);
    const payments_pending_7d = getSettledNumber(paymentsPending7dResult);
    const payments_approved_7d = getSettledNumber(paymentsApproved7dResult);
    const payments_failed_7d = getSettledNumber(paymentsFailed7dResult);
    const users_free = getSettledNumber(usersFreeResult);
    const users_basic = getSettledNumber(usersBasicResult);
    const users_pro = getSettledNumber(usersProResult);
    const users_admin = getSettledNumber(usersAdminResult);
    const identity_verifications_pending = getSettledNumber(identityVerificationsPendingResult);
    const reports_pending = getSettledNumber(reportsPendingResult);

    const planClicks7d = basic_clicks_7d + pro_clicks_7d + enterprise_clicks_7d;
    const paymentsTotal7d =
      payments_created_7d + payments_pending_7d + payments_approved_7d + payments_failed_7d;

    const metrics = {
      searches_today,
      searches_7d,
      unique_search_users_7d,
      upgrade_clicks_7d,
      basic_clicks_7d,
      pro_clicks_7d,
      enterprise_clicks_7d,
      payments_created_7d,
      payments_pending_7d,
      payments_approved_7d,
      payments_failed_7d,
      users_free,
      users_basic,
      users_pro,
      users_admin,
      identity_verifications_pending,
      reports_pending,
      conversion_search_to_upgrade_7d:
        searches_7d > 0 ? roundPercentage((upgrade_clicks_7d / searches_7d) * 100) : 0,
      conversion_upgrade_to_plan_click_7d:
        upgrade_clicks_7d > 0 ? roundPercentage((planClicks7d / upgrade_clicks_7d) * 100) : 0,
      payment_approval_rate_7d:
        paymentsTotal7d > 0 ? roundPercentage((payments_approved_7d / paymentsTotal7d) * 100) : 0,
    };

    console.log('[ADMIN_METRICS]', {
      searches_7d,
      upgrade_clicks_7d,
      payments_approved_7d,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      metrics,
    });
  }
);

app.get(
  '/api/admin/identity-verifications',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
      const verificationStatusFilter =
        normalizeOptionalFilter(req.query.verification_status, 40)?.toLowerCase() || null;
      const reportingEligibilityFilter =
        normalizeOptionalFilter(req.query.reporting_eligibility_status, 40)?.toLowerCase() || null;
      const userEmailFilter =
        normalizeOptionalFilter(req.query.user_email, 180)?.toLowerCase() || null;
      const documentStatusFilter =
        normalizeOptionalFilter(req.query.document_verification_status, 40)?.toLowerCase() || null;

      let allowedUserIds: string[] | null = null;

      if (verificationStatusFilter || reportingEligibilityFilter || userEmailFilter) {
        let usersQuery = supabase
          .from('users')
          .select(IDENTITY_VERIFICATION_USER_SELECT_COLUMNS.join(', '));

        if (verificationStatusFilter) {
          usersQuery = usersQuery.eq('identity_verification_status', verificationStatusFilter);
        }

        if (reportingEligibilityFilter) {
          usersQuery = usersQuery.eq('reporting_eligibility_status', reportingEligibilityFilter);
        }

        if (userEmailFilter) {
          usersQuery = usersQuery.ilike('email', `%${userEmailFilter}%`);
        }

        const { data: matchingUsers, error: matchingUsersError } = await usersQuery;

        if (matchingUsersError) {
          throw matchingUsersError;
        }

        allowedUserIds = Array.from(
          new Set(
            ((matchingUsers || []) as Array<Record<string, any>>)
              .map((user) => user.id as string)
              .filter(Boolean)
          )
        );

        if (allowedUserIds.length === 0) {
          res.json({
            success: true,
            verifications: [],
            users: [],
            pagination: { page, pageSize, total: 0, totalPages: 0 },
          });
          return;
        }
      }

      let documentsQuery = supabase
        .from('secure_documents' as any)
        .select(
          'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
        )
        .eq('document_category', 'identity_document')
        .eq('related_entity_type', 'identity_verification')
        .neq('status', 'deleted')
        .order('uploaded_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (allowedUserIds) {
        documentsQuery = documentsQuery.in('owner_user_id', allowedUserIds);
      }

      if (req.query.document_number && String(req.query.document_number).trim()) {
        documentsQuery = documentsQuery.filter(
          'metadata->identity_verification->>document_number',
          'ilike',
          `%${String(req.query.document_number).trim().slice(0, 40)}%`
        );
      }

      const { data: documentsData, error: documentsError } = await documentsQuery;

      if (documentsError) {
        throw documentsError;
      }

      const allIdentityDocuments = (documentsData || []) as unknown as SecureDocumentAccessMetadata[];
      const filteredIdentityDocuments =
        documentStatusFilter === 'pending' ||
        documentStatusFilter === 'approved' ||
        documentStatusFilter === 'rejected'
          ? allIdentityDocuments.filter(
              (document) => getIdentityDocumentReviewStatus(document) === documentStatusFilter
            )
          : allIdentityDocuments;
      const total = filteredIdentityDocuments.length;
      const identityDocuments = filteredIdentityDocuments.slice(
        (page - 1) * pageSize,
        page * pageSize
      );
      const ownerUserIds = Array.from(
        new Set(identityDocuments.map((document) => document.owner_user_id).filter(Boolean) as string[])
      );
      const usersById: Record<string, Record<string, any>> = {};

      if (ownerUserIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select(IDENTITY_VERIFICATION_USER_SELECT_COLUMNS.join(', '))
          .in('id', ownerUserIds);

        if (usersError) {
          throw usersError;
        }

        (users || []).forEach((user) => {
          usersById[(user as Record<string, any>).id] = user as Record<string, any>;
        });
      }

      const verifications = identityDocuments.map((document) =>
        buildAdminIdentityVerificationDocumentResponse(
          document,
          document.owner_user_id ? usersById[document.owner_user_id] || null : null
        )
      );
      res.json({
        success: true,
        verifications,
        users: verifications,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
        },
      });
    } catch (error) {
      console.error('[IDENTITY_VERIFICATION]', {
        action: 'admin_list_error',
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudieron cargar las verificaciones de identidad',
      });
    }
  }
);

app.patch(
  '/api/admin/identity-verifications/documents/:documentId',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const adminUserId = req.user?.id;
      const documentIdValidation = z.string().uuid().safeParse(documentId);
      const parsed = adminIdentityVerificationUpdateSchema.safeParse(req.body ?? {});

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      if (!documentIdValidation.success) {
        res.status(400).json({
          success: false,
          message: 'document_id invalido',
        });
        return;
      }

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de actualizacion invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      const { data: existingDocument, error: documentError } = await supabase
        .from('secure_documents' as any)
        .select(
          'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
        )
        .eq('id', documentIdValidation.data)
        .maybeSingle();

      if (documentError) {
        throw documentError;
      }

      const document = existingDocument as unknown as SecureDocumentAccessMetadata | null;

      if (!document || document.deleted_at || document.status === 'deleted') {
        res.status(404).json({
          success: false,
          message: 'Documento de identidad no encontrado',
        });
        return;
      }

      if (
        document.document_category !== 'identity_document' ||
        document.related_entity_type !== 'identity_verification' ||
        !document.owner_user_id
      ) {
        res.status(400).json({
          success: false,
          message: 'El documento no pertenece a una verificacion de identidad',
        });
        return;
      }

      if (parsed.data.action === 'approve' && document.status !== 'uploaded') {
        res.status(409).json({
          success: false,
          message: 'Solo se puede aprobar un documento de identidad cargado',
        });
        return;
      }

      const nowISO = new Date().toISOString();
      const isApproved = parsed.data.action === 'approve';
      const notes = normalizeNullableText(parsed.data.notes, 2000);
      const currentMetadata =
        document.metadata && typeof document.metadata === 'object' ? document.metadata : {};
      const currentIdentityMetadata = getIdentityVerificationMetadata(document);
      const nextIdentityMetadata = {
        ...currentIdentityMetadata,
        review_status: isApproved ? 'approved' : 'rejected',
        reviewed_at: nowISO,
        reviewed_by: adminUserId,
        review_notes: notes,
      };
      const nextMetadata = {
        ...currentMetadata,
        identity_verification: nextIdentityMetadata,
      };

      const { data: updatedDocumentData, error: updateDocumentError } = await supabase
        .from('secure_documents' as any)
        .update({
          metadata: nextMetadata,
          status: isApproved ? 'ready_for_review' : 'rejected',
          verified_at: isApproved ? nowISO : null,
          rejected_at: isApproved ? null : nowISO,
          rejection_reason: isApproved ? null : notes,
        })
        .eq('id', document.id)
        .select(
          'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
        )
        .single();

      if (updateDocumentError || !updatedDocumentData) {
        throw updateDocumentError || new Error('No se pudo actualizar el documento');
      }

      const { data: otherApprovedDocuments, error: otherApprovedDocumentsError } = await supabase
        .from('secure_documents' as any)
        .select('id')
        .eq('owner_user_id', document.owner_user_id)
        .eq('document_category', 'identity_document')
        .eq('related_entity_type', 'identity_verification')
        .neq('id', document.id)
        .neq('status', 'deleted')
        .not('verified_at', 'is', null)
        .limit(1);

      if (otherApprovedDocumentsError) {
        throw otherApprovedDocumentsError;
      }

      const hasOtherApprovedDocument = (otherApprovedDocuments || []).length > 0;
      const userUpdatePayload: Record<string, unknown> = {
        identity_verification_notes: notes,
      };

      if (isApproved) {
        userUpdatePayload.identity_verification_status = 'verified';
        userUpdatePayload.identity_verified_at = nowISO;
        userUpdatePayload.identity_verification_method = 'admin_document_review';
        userUpdatePayload.reporting_eligibility_status = 'allowed';
      } else if (!hasOtherApprovedDocument) {
        userUpdatePayload.identity_verification_status = 'rejected';
        userUpdatePayload.identity_verified_at = null;
        userUpdatePayload.reporting_eligibility_status = 'not_allowed';
      }

      const { data: user, error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdatePayload)
        .eq('id', document.owner_user_id)
        .select(IDENTITY_VERIFICATION_USER_SELECT_COLUMNS.join(', '))
        .single();

      if (userUpdateError || !user) {
        throw userUpdateError || new Error('Usuario no encontrado');
      }

      const updatedDocument = updatedDocumentData as unknown as SecureDocumentAccessMetadata;
      const verification = buildAdminIdentityVerificationDocumentResponse(
        updatedDocument,
        user as Record<string, any>
      );

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: isApproved
          ? 'identity_verification.document.approve'
          : 'identity_verification.document.reject',
        severity: 'high',
        target: {
          type: 'secure_document',
          id: document.id,
          reference: document.owner_user_id,
        },
        previous_state: {
          secure_document_id: document.id,
          owner_user_id: document.owner_user_id,
          review_status: getIdentityDocumentReviewStatus(document),
          secure_document_status: document.status,
        },
        new_state: {
          secure_document_id: updatedDocument.id,
          owner_user_id: updatedDocument.owner_user_id,
          review_status: getIdentityDocumentReviewStatus(updatedDocument),
          secure_document_status: updatedDocument.status,
          identity_verification_status: userUpdatePayload.identity_verification_status || null,
          reporting_eligibility_status: userUpdatePayload.reporting_eligibility_status || null,
        },
        reason: notes,
      });

      res.json({
        success: true,
        verification,
        user: {
          ...((user as unknown) as Record<string, unknown>),
          document_type: verification.document_type,
          document_number: verification.document_number,
          full_legal_name: verification.full_legal_name,
          phone_number: verification.phone_number,
          documents: [buildIdentityVerificationSecureDocumentResponse(updatedDocument)],
        },
      });
    } catch (error) {
      console.error('[IDENTITY_VERIFICATION]', {
        action: 'admin_document_update_error',
        document_id: req.params.documentId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar el documento de identidad',
      });
    }
  }
);

app.patch(
  '/api/admin/identity-verifications/:userId',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminUserId = req.user?.id;
      const parsed = adminIdentityVerificationUpdateSchema.safeParse(req.body ?? {});

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de actualizacion invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      const nowISO = new Date().toISOString();
      const isApproved = parsed.data.action === 'approve';
      const notes = normalizeNullableText(parsed.data.notes, 2000);

      const updatePayload: Record<string, unknown> = {
        identity_verification_status: isApproved ? 'verified' : 'rejected',
        reporting_eligibility_status: isApproved ? 'allowed' : 'not_allowed',
        identity_verification_notes: notes,
      };

      if (isApproved) {
        updatePayload.identity_verified_at = nowISO;
        updatePayload.identity_verification_method = 'admin_document_review';
      } else {
        updatePayload.identity_verified_at = null;
      }

      const { data: user, error } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select(IDENTITY_VERIFICATION_USER_SELECT_COLUMNS.join(', '))
        .single();

      if (error || !user) {
        throw error || new Error('Usuario no encontrado');
      }

      const { error: documentsError } = await supabase
        .from('secure_documents' as any)
        .update({
          status: isApproved ? 'ready_for_review' : 'rejected',
          verified_at: isApproved ? nowISO : null,
          rejected_at: isApproved ? null : nowISO,
          rejection_reason: isApproved ? null : notes,
        })
        .eq('owner_user_id', userId)
        .eq('document_category', 'identity_document')
        .eq('related_entity_type', 'identity_verification')
        .neq('status', 'deleted');

      if (documentsError) {
        throw documentsError;
      }

      const { data: documents, error: documentsFetchError } = await supabase
        .from('secure_documents' as any)
        .select(
          'id, owner_user_id, related_entity_type, related_entity_id, document_category, bucket_name, storage_path, original_file_name, mime_type, file_size, sha256_hash, status, uploaded_at, verified_at, rejected_at, rejection_reason, retention_until, legal_hold, deleted_at, deletion_reason, metadata, created_at, updated_at'
        )
        .eq('owner_user_id', userId)
        .eq('document_category', 'identity_document')
        .eq('related_entity_type', 'identity_verification')
        .neq('status', 'deleted')
        .order('uploaded_at', { ascending: false });

      if (documentsFetchError) {
        throw documentsFetchError;
      }

      const identityDocuments = ((documents || []) as unknown as SecureDocumentAccessMetadata[]).map(
        buildIdentityVerificationSecureDocumentResponse
      );
      const latestIdentityDocument = ((documents || []) as unknown as SecureDocumentAccessMetadata[])[0] || null;
      const latestIdentityMetadata = latestIdentityDocument
        ? getIdentityVerificationMetadata(latestIdentityDocument)
        : {};

      console.log('[IDENTITY_VERIFICATION]', {
        action: isApproved ? 'admin_approved' : 'admin_rejected',
        user_id: userId,
        admin_user_id: adminUserId,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: isApproved
          ? 'identity_verification.approve'
          : 'identity_verification.reject',
        severity: 'high',
        target: {
          type: 'user',
          id: userId,
          reference:
            (((user as unknown) as Record<string, unknown>).email as string | undefined) ||
            null,
        },
        previous_state: {
          identity_verification_status: 'pending_review',
        },
        new_state: {
          identity_verification_status: updatePayload.identity_verification_status,
          reporting_eligibility_status: updatePayload.reporting_eligibility_status,
          identity_verification_method: updatePayload.identity_verification_method || null,
        },
        reason: notes,
      });

      res.json({
        success: true,
        user: {
          ...((user as unknown) as Record<string, unknown>),
          document_type:
            typeof latestIdentityMetadata.document_type === 'string'
              ? latestIdentityMetadata.document_type
              : null,
          document_number:
            typeof latestIdentityMetadata.document_number === 'string'
              ? latestIdentityMetadata.document_number
              : null,
          full_legal_name:
            typeof latestIdentityMetadata.full_legal_name === 'string'
              ? latestIdentityMetadata.full_legal_name
              : null,
          phone_number:
            typeof latestIdentityMetadata.phone_number === 'string'
              ? latestIdentityMetadata.phone_number
              : null,
          documents: identityDocuments,
        },
      });
    } catch (error) {
      console.error('[IDENTITY_VERIFICATION]', {
        action: 'admin_update_error',
        user_id: req.params.userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la verificacion de identidad',
      });
    }
  }
);

app.get(
  '/api/admin/reports',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const { data: reports, error } = await applyAdminPendingReportsFilter(
        supabase
          .from('reports')
          .select(`
            ${REPORT_SELECT_COLUMNS.join(',')},
            tenants (
              nombre,
              cedula,
              ciudad
            )
          `)
      ).order('fecha_reporte', { ascending: false });

      if (error) {
        throw error;
      }

      const reportList = (((reports || []) as unknown) as AdminReportRow[]).filter(
        isAdminReportPendingReview
      );

      const reporterIds = Array.from(
        new Set(
          reportList
            .map((report) => report.reportado_por)
            .filter((id): id is string => Boolean(id))
        )
      );

      let usersById: Record<string, AdminReporterUser> = {};

      if (reporterIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, nombre, email, tipo_usuario')
          .in('id', reporterIds);

        if (usersError) {
          throw usersError;
        }

        usersById = (users || []).reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {} as Record<string, AdminReporterUser>);
      }

      const reportIds = reportList.map((report) => report.id);
      let evidenceByReportId: Record<string, unknown[]> = {};
      let reviewLogsByReportId: Record<string, ReportReviewLogRow[]> = {};
      let subjectNoticesByReportId: Record<string, ReportSubjectNoticeRow[]> = {};

      if (reportIds.length > 0) {
        const { data: evidenceFiles, error: evidenceError } = await supabase
          .from('report_evidence_files')
          .select(REPORT_EVIDENCE_SELECT_COLUMNS.join(', '))
          .in('report_id', reportIds)
          .order('uploaded_at', { ascending: false });

        if (evidenceError) {
          if (isMissingSchemaError(evidenceError)) {
            logAdminEndpointError({
              endpoint: '/api/admin/reports',
              table: 'report_evidence_files',
              operation: 'select',
              error: evidenceError,
              level: 'warn',
            });
          } else {
            throw evidenceError;
          }
        } else {
          evidenceByReportId = ((evidenceFiles || []) as Array<Record<string, any>>).reduce(
            (acc, evidence) => {
              const reportId = evidence.report_id as string;
              acc[reportId] = acc[reportId] || [];
              acc[reportId].push(evidence);
              return acc;
            },
            {} as Record<string, unknown[]>
          );
        }

        const { data: reviewLogs, error: reviewLogsError } = await supabase
          .from('report_review_logs')
          .select(REPORT_REVIEW_LOG_SELECT_COLUMNS.join(', '))
          .in('report_id', reportIds)
          .order('created_at', { ascending: false });

        if (reviewLogsError) {
          if (isMissingSchemaError(reviewLogsError)) {
            logAdminEndpointError({
              endpoint: '/api/admin/reports',
              table: 'report_review_logs',
              operation: 'select',
              error: reviewLogsError,
              level: 'warn',
            });
          } else {
            throw reviewLogsError;
          }
        } else {
          reviewLogsByReportId = (((reviewLogs || []) as unknown) as ReportReviewLogRow[]).reduce(
            (acc, log) => {
              acc[log.report_id] = acc[log.report_id] || [];
              acc[log.report_id].push(log);
              return acc;
            },
            {} as Record<string, ReportReviewLogRow[]>
          );
        }

        const { data: subjectNotices, error: subjectNoticesError } = await supabase
          .from('report_subject_notices')
          .select(REPORT_SUBJECT_NOTICE_SELECT_COLUMNS.join(', '))
          .in('report_id', reportIds)
          .order('created_at', { ascending: false });

        if (subjectNoticesError) {
          if (isMissingSchemaError(subjectNoticesError)) {
            logAdminEndpointError({
              endpoint: '/api/admin/reports',
              table: 'report_subject_notices',
              operation: 'select',
              error: subjectNoticesError,
              level: 'warn',
            });
          } else {
            throw subjectNoticesError;
          }
        } else {
          subjectNoticesByReportId = (((subjectNotices || []) as unknown) as ReportSubjectNoticeRow[]).reduce(
            (acc, notice) => {
              acc[notice.report_id] = acc[notice.report_id] || [];
              acc[notice.report_id].push(notice);
              return acc;
            },
            {} as Record<string, ReportSubjectNoticeRow[]>
          );
        }
      }

      const enrichedReports = reportList.map((report) => ({
        ...report,
        admin_review_status: getAdminReportReviewStatus(report),
        users: report.reportado_por ? usersById[report.reportado_por] || null : null,
        evidence_files: evidenceByReportId[report.id] || [],
        report_review_logs: reviewLogsByReportId[report.id] || [],
        subject_notices: subjectNoticesByReportId[report.id] || [],
      }));

      res.json({
        success: true,
        reports: enrichedReports,
      });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendAdminMigrationRequired(res, {
          endpoint: '/api/admin/reports',
          table: 'reports',
          operation: 'select',
          error,
          message: 'Falta ejecutar la migracion de revision de reportes para cargar este modulo',
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/reports',
        table: 'reports',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

app.get(
  '/api/admin/data-requests',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
      const statusFilter = normalizeOptionalFilter(req.query.status, 40);
      const requestTypeFilter = normalizeOptionalFilter(req.query.request_type, 60);
      const requesterEmailFilter =
        normalizeOptionalFilter(req.query.requester_email, 180)?.toLowerCase() || null;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('data_subject_requests')
        .select(
          [
            'id',
            'user_id',
            'requester_email',
            'requester_name',
            'requester_document_id',
            'request_type',
            'status',
            'description',
            'admin_notes',
            'submitted_at',
            'due_at',
            'resolved_at',
            'resolved_by',
            'created_at',
            'updated_at',
          ].join(', '),
          { count: 'exact' }
        )
        .order('due_at', { ascending: true })
        .order('submitted_at', { ascending: false })
        .range(from, to);

      if (statusFilter && DATA_SUBJECT_REQUEST_STATUSES.includes(statusFilter as DataSubjectRequestStatus)) {
        query = query.eq('status', statusFilter);
      }

      if (
        requestTypeFilter &&
        DATA_SUBJECT_REQUEST_TYPES.includes(requestTypeFilter as DataSubjectRequestType)
      ) {
        query = query.eq('request_type', requestTypeFilter);
      }

      if (requesterEmailFilter) {
        query = query.ilike('requester_email', `%${requesterEmailFilter}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const requests = (data || []) as unknown as DataSubjectRequestRow[];

      res.json({
        success: true,
        requests,
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: count && count > 0 ? Math.ceil(count / pageSize) : 0,
        },
      });
    } catch (error) {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);

      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/data-requests',
          table: 'data_subject_requests',
          operation: 'select',
          error,
          body: {
            requests: [],
            pagination: buildAdminPagination(page, pageSize),
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/data-requests',
        table: 'data_subject_requests',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'No se pudieron cargar las solicitudes de datos',
      });
    }
  }
);

app.patch(
  '/api/admin/data-requests/:id',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = adminDataSubjectRequestUpdateSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de actualizacion invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      if (!parsed.data.status && parsed.data.admin_notes === undefined) {
        res.status(400).json({
          success: false,
          message: 'No hay cambios para aplicar',
        });
        return;
      }

      const { data: existingRequest, error: existingError } = await supabase
        .from('data_subject_requests')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingRequest) {
        res.status(404).json({
          success: false,
          message: 'Solicitud no encontrada',
        });
        return;
      }

      const nowISO = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        updated_at: nowISO,
      };

      if (parsed.data.status) {
        updatePayload.status = parsed.data.status;

        if (parsed.data.status === 'resolved' || parsed.data.status === 'rejected') {
          updatePayload.resolved_at = nowISO;
          updatePayload.resolved_by = req.user?.id || null;
        }
      }

      if (parsed.data.admin_notes !== undefined) {
        updatePayload.admin_notes = normalizeNullableText(parsed.data.admin_notes, 2000);
      }

      const { data, error } = await supabase
        .from('data_subject_requests')
        .update(updatePayload)
        .eq('id', id)
        .select(
          [
            'id',
            'user_id',
            'requester_email',
            'requester_name',
            'requester_document_id',
            'request_type',
            'status',
            'description',
            'admin_notes',
            'submitted_at',
            'due_at',
            'resolved_at',
            'resolved_by',
            'created_at',
            'updated_at',
          ].join(', ')
        )
        .single();

      if (error || !data) {
        throw error || new Error('No se pudo actualizar la solicitud');
      }

      const updatedRequest = data as unknown as DataSubjectRequestRow;

      console.log('[DATA_SUBJECT_REQUESTS]', {
        action: 'admin_updated',
        request_id: id,
        previous_status: existingRequest.status,
        next_status: updatedRequest.status,
        admin_user_id: req.user?.id || null,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type:
          updatedRequest.status === 'resolved'
            ? 'data_request.resolve'
            : updatedRequest.status === 'rejected'
              ? 'data_request.reject'
              : 'data_request.update',
        severity:
          updatedRequest.status === 'resolved' || updatedRequest.status === 'rejected'
            ? 'high'
            : 'medium',
        target: {
          type: 'data_subject_request',
          id,
          reference: updatedRequest.requester_email,
        },
        previous_state: {
          status: existingRequest.status,
        },
        new_state: {
          status: updatedRequest.status,
          request_type: updatedRequest.request_type,
          resolved_at: updatedRequest.resolved_at,
          resolved_by: updatedRequest.resolved_by,
        },
        reason: updatedRequest.admin_notes,
      });

      res.json({
        success: true,
        request: updatedRequest,
      });
    } catch (error) {
      console.error('[DATA_SUBJECT_REQUESTS]', {
        action: 'admin_update_error',
        request_id: req.params.id,
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la solicitud',
      });
    }
  }
);

app.get(
  '/api/admin/human-review-requests',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
      const statusFilter = normalizeOptionalFilter(req.query.status, 40);
      const reasonFilter = normalizeOptionalFilter(req.query.reason, 80);
      const requesterEmailFilter =
        normalizeOptionalFilter(req.query.requester_email, 180)?.toLowerCase() || null;
      const requesterDocumentFilter =
        normalizeOptionalFilter(req.query.requester_document_id, 80) || null;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('human_review_requests')
        .select(HUMAN_REVIEW_REQUEST_SELECT_COLUMNS.join(', '), { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter && HUMAN_REVIEW_REQUEST_STATUSES.includes(statusFilter as HumanReviewRequestStatus)) {
        query = query.eq('status', statusFilter);
      }

      if (reasonFilter && HUMAN_REVIEW_REQUEST_REASONS.includes(reasonFilter as HumanReviewRequestReason)) {
        query = query.eq('reason', reasonFilter);
      }

      if (requesterEmailFilter) {
        query = query.ilike('requester_email', `%${requesterEmailFilter}%`);
      }

      if (requesterDocumentFilter) {
        query = query.ilike('requester_document_id', `%${requesterDocumentFilter}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        requests: (data || []) as unknown as HumanReviewRequestRow[],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: count && count > 0 ? Math.ceil(count / pageSize) : 0,
        },
      });
    } catch (error) {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);

      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/human-review-requests',
          table: 'human_review_requests',
          operation: 'select',
          error,
          body: {
            requests: [],
            pagination: buildAdminPagination(page, pageSize),
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/human-review-requests',
        table: 'human_review_requests',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'No se pudieron cargar las solicitudes de revision humana',
      });
    }
  }
);

app.patch(
  '/api/admin/human-review-requests/:id',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = adminHumanReviewRequestUpdateSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de revision humana invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      if (
        !parsed.data.status &&
        parsed.data.admin_notes === undefined &&
        parsed.data.review_summary === undefined
      ) {
        res.status(400).json({
          success: false,
          message: 'No hay cambios para aplicar',
        });
        return;
      }

      const { data: existingRequest, error: existingError } = await supabase
        .from('human_review_requests')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingRequest) {
        res.status(404).json({
          success: false,
          message: 'Solicitud de revision humana no encontrada',
        });
        return;
      }

      const nowISO = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        updated_at: nowISO,
      };

      if (parsed.data.status) {
        updatePayload.status = parsed.data.status;

        if (parsed.data.status === 'resolved' || parsed.data.status === 'rejected') {
          updatePayload.resolved_at = nowISO;
          updatePayload.resolved_by = req.user?.id || null;
        }
      }

      if (parsed.data.admin_notes !== undefined) {
        updatePayload.admin_notes = normalizeNullableText(parsed.data.admin_notes, 2000);
      }

      if (parsed.data.review_summary !== undefined) {
        updatePayload.review_summary = normalizeNullableText(parsed.data.review_summary, 2000);
      }

      const { data, error } = await supabase
        .from('human_review_requests')
        .update(updatePayload)
        .eq('id', id)
        .select(HUMAN_REVIEW_REQUEST_SELECT_COLUMNS.join(', '))
        .single();

      if (error || !data) {
        throw error || new Error('No se pudo actualizar la solicitud de revision humana');
      }

      const updatedRequest = data as unknown as HumanReviewRequestRow;

      console.log('[HUMAN_REVIEW_REQUESTS]', {
        action: 'admin_updated',
        request_id: id,
        previous_status: existingRequest.status,
        next_status: updatedRequest.status,
        admin_user_id: req.user?.id || null,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type:
          updatedRequest.status === 'resolved'
            ? 'human_review.resolve'
            : updatedRequest.status === 'rejected'
              ? 'human_review.reject'
              : 'human_review.update',
        severity:
          updatedRequest.status === 'resolved' || updatedRequest.status === 'rejected'
            ? 'high'
            : 'medium',
        target: {
          type: 'human_review_request',
          id,
          reference: updatedRequest.requester_email,
        },
        previous_state: {
          status: existingRequest.status,
        },
        new_state: {
          status: updatedRequest.status,
          reason: updatedRequest.reason,
          cedula_consultada: updatedRequest.cedula_consultada,
          resolved_at: updatedRequest.resolved_at,
          resolved_by: updatedRequest.resolved_by,
        },
        reason: updatedRequest.review_summary || updatedRequest.admin_notes,
      });

      res.json({
        success: true,
        request: updatedRequest,
      });
    } catch (error) {
      console.error('[HUMAN_REVIEW_REQUESTS]', {
        action: 'admin_update_error',
        request_id: req.params.id,
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la solicitud de revision humana',
      });
    }
  }
);

app.get(
  '/api/admin/disputes',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
      const statusFilter = normalizeOptionalFilter(req.query.status, 40);
      const targetTypeFilter = normalizeOptionalFilter(req.query.target_type, 60);
      const disputeTypeFilter = normalizeOptionalFilter(req.query.dispute_type, 60);
      const requesterEmailFilter =
        normalizeOptionalFilter(req.query.requester_email, 180)?.toLowerCase() || null;
      const requesterDocumentFilter =
        normalizeOptionalFilter(req.query.requester_document_id, 80) || null;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('data_disputes')
        .select(DATA_DISPUTE_SELECT_COLUMNS.join(', '), { count: 'exact' })
        .order('due_at', { ascending: true })
        .order('submitted_at', { ascending: false })
        .range(from, to);

      if (statusFilter && DATA_DISPUTE_STATUSES.includes(statusFilter as DataDisputeStatus)) {
        query = query.eq('status', statusFilter);
      }

      if (
        targetTypeFilter &&
        DATA_DISPUTE_TARGET_TYPES.includes(targetTypeFilter as DataDisputeTargetType)
      ) {
        query = query.eq('target_type', targetTypeFilter);
      }

      if (disputeTypeFilter && DATA_DISPUTE_TYPES.includes(disputeTypeFilter as DataDisputeType)) {
        query = query.eq('dispute_type', disputeTypeFilter);
      }

      if (requesterEmailFilter) {
        query = query.ilike('requester_email', `%${requesterEmailFilter}%`);
      }

      if (requesterDocumentFilter) {
        query = query.ilike('requester_document_id', `%${requesterDocumentFilter}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        disputes: (data || []) as unknown as DataDisputeRow[],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: count && count > 0 ? Math.ceil(count / pageSize) : 0,
        },
      });
    } catch (error) {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);

      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/disputes',
          table: 'data_disputes',
          operation: 'select',
          error,
          body: {
            disputes: [],
            pagination: buildAdminPagination(page, pageSize),
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/disputes',
        table: 'data_disputes',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'No se pudieron cargar las disputas',
      });
    }
  }
);

app.patch(
  '/api/admin/disputes/:id',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = adminDataDisputeUpdateSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de disputa invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      if (
        !parsed.data.status &&
        parsed.data.admin_notes === undefined &&
        parsed.data.resolution_summary === undefined
      ) {
        res.status(400).json({
          success: false,
          message: 'No hay cambios para aplicar',
        });
        return;
      }

      const { data: existingDispute, error: existingError } = await supabase
        .from('data_disputes')
        .select(DATA_DISPUTE_SELECT_COLUMNS.join(', '))
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingDispute) {
        res.status(404).json({
          success: false,
          message: 'Disputa no encontrada',
        });
        return;
      }

      const existing = existingDispute as unknown as DataDisputeRow;
      const nowISO = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        updated_at: nowISO,
      };

      if (parsed.data.status) {
        updatePayload.status = parsed.data.status;

        if (['accepted', 'rejected', 'resolved'].includes(parsed.data.status)) {
          updatePayload.resolved_at = existing.resolved_at || nowISO;
          updatePayload.resolved_by = req.user?.id || null;
        }
      }

      if (parsed.data.admin_notes !== undefined) {
        updatePayload.admin_notes = normalizeNullableText(parsed.data.admin_notes, 2000);
      }

      if (parsed.data.resolution_summary !== undefined) {
        updatePayload.resolution_summary = normalizeNullableText(
          parsed.data.resolution_summary,
          2000
        );
      }

      const { data, error } = await supabase
        .from('data_disputes')
        .update(updatePayload)
        .eq('id', id)
        .select(DATA_DISPUTE_SELECT_COLUMNS.join(', '))
        .single();

      if (error || !data) {
        throw error || new Error('No se pudo actualizar la disputa');
      }

      const updatedDispute = data as unknown as DataDisputeRow;
      let targetSync: { targetFound: boolean; updated: boolean } | null = null;

      if (parsed.data.status === 'accepted' || parsed.data.status === 'resolved') {
        targetSync = await syncTargetDisputeStatus({
          targetType: updatedDispute.target_type,
          targetId: updatedDispute.target_id,
          disputeStatus: 'resolved',
          legalReviewStatus: 'reviewed',
          adminUserId: req.user?.id || null,
        });
      }

      if (parsed.data.status === 'rejected') {
        targetSync = await syncTargetDisputeStatus({
          targetType: updatedDispute.target_type,
          targetId: updatedDispute.target_id,
          disputeStatus: 'rejected',
          adminUserId: req.user?.id || null,
        });
      }

      console.log('[DATA_DISPUTES]', {
        action: 'admin_updated',
        dispute_id: id,
        previous_status: existing.status,
        next_status: updatedDispute.status,
        target_type: updatedDispute.target_type,
        target_found: targetSync?.targetFound ?? null,
        target_marked: targetSync?.updated ?? null,
        admin_user_id: req.user?.id || null,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type:
          updatedDispute.status === 'accepted'
            ? 'data_dispute.accept'
            : updatedDispute.status === 'rejected'
              ? 'data_dispute.reject'
              : updatedDispute.status === 'resolved'
                ? 'data_dispute.resolve'
                : 'data_dispute.update',
        severity: ['accepted', 'rejected', 'resolved'].includes(updatedDispute.status)
          ? 'high'
          : 'medium',
        target: {
          type: 'data_dispute',
          id,
          reference: updatedDispute.target_reference || updatedDispute.requester_email,
        },
        previous_state: {
          status: existing.status,
          target_type: existing.target_type,
          target_id: existing.target_id,
          target_reference: existing.target_reference,
        },
        new_state: {
          status: updatedDispute.status,
          target_type: updatedDispute.target_type,
          target_id: updatedDispute.target_id,
          target_reference: updatedDispute.target_reference,
          target_sync: targetSync,
          resolved_at: updatedDispute.resolved_at,
          resolved_by: updatedDispute.resolved_by,
        },
        reason: updatedDispute.resolution_summary || updatedDispute.admin_notes,
      });

      res.json({
        success: true,
        dispute: updatedDispute,
      });
    } catch (error) {
      console.error('[DATA_DISPUTES]', {
        action: 'admin_update_error',
        dispute_id: req.params.id,
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la disputa',
      });
    }
  }
);

app.get(
  '/api/admin/data-inventory',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
      const dataDomainFilter = normalizeOptionalFilter(req.query.data_domain, 60);
      const dataCategoryFilter = normalizeOptionalFilter(req.query.data_category, 60);
      const sensitivityFilter = normalizeOptionalFilter(req.query.sensitivity_level, 40);
      const legalBasisFilter = normalizeOptionalFilter(req.query.legal_basis, 60);
      const impactsScoringFilter = parseOptionalBooleanFilter(req.query.impacts_scoring);
      const isActiveFilter = parseOptionalBooleanFilter(req.query.is_active);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('data_inventory_items')
        .select(
          [
            'id',
            'data_domain',
            'field_name',
            'description',
            'data_category',
            'sensitivity_level',
            'source_type',
            'legal_basis',
            'purpose',
            'retention_policy',
            'retention_days',
            'impacts_scoring',
            'requires_consent',
            'is_public_source',
            'is_active',
            'created_at',
            'updated_at',
          ].join(', '),
          { count: 'exact' }
        )
        .order('data_domain', { ascending: true })
        .order('field_name', { ascending: true })
        .range(from, to);

      if (
        dataDomainFilter &&
        DATA_INVENTORY_DOMAINS.includes(dataDomainFilter as DataInventoryDomain)
      ) {
        query = query.eq('data_domain', dataDomainFilter);
      }

      if (
        dataCategoryFilter &&
        DATA_INVENTORY_CATEGORIES.includes(dataCategoryFilter as DataInventoryCategory)
      ) {
        query = query.eq('data_category', dataCategoryFilter);
      }

      if (
        sensitivityFilter &&
        DATA_INVENTORY_SENSITIVITY_LEVELS.includes(
          sensitivityFilter as DataInventorySensitivity
        )
      ) {
        query = query.eq('sensitivity_level', sensitivityFilter);
      }

      if (
        legalBasisFilter &&
        DATA_INVENTORY_LEGAL_BASES.includes(legalBasisFilter as DataInventoryLegalBasis)
      ) {
        query = query.eq('legal_basis', legalBasisFilter);
      }

      if (impactsScoringFilter !== null) {
        query = query.eq('impacts_scoring', impactsScoringFilter);
      }

      if (isActiveFilter !== null) {
        query = query.eq('is_active', isActiveFilter);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        items: (data || []) as unknown as DataInventoryItemRow[],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: count && count > 0 ? Math.ceil(count / pageSize) : 0,
        },
      });
    } catch (error) {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);

      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/data-inventory',
          table: 'data_inventory_items',
          operation: 'select',
          error,
          body: {
            items: [],
            pagination: buildAdminPagination(page, pageSize),
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/data-inventory',
        table: 'data_inventory_items',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo cargar el inventario de datos',
      });
    }
  }
);

app.post(
  '/api/admin/data-inventory',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = dataInventoryCreateSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de inventario invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      const { data, error } = await supabase
        .from('data_inventory_items')
        .insert(parsed.data)
        .select(
          [
            'id',
            'data_domain',
            'field_name',
            'description',
            'data_category',
            'sensitivity_level',
            'source_type',
            'legal_basis',
            'purpose',
            'retention_policy',
            'retention_days',
            'impacts_scoring',
            'requires_consent',
            'is_public_source',
            'is_active',
            'created_at',
            'updated_at',
          ].join(', ')
        )
        .single();

      if (error || !data) {
        throw error || new Error('No se pudo crear el item de inventario');
      }

      const item = data as unknown as DataInventoryItemRow;

      console.log('[DATA_INVENTORY]', {
        action: 'created',
        admin_user_id: req.user?.id || null,
        item_id: item.id,
        data_domain: item.data_domain,
        field_name: item.field_name,
      });

      res.status(201).json({
        success: true,
        item,
      });
    } catch (error: any) {
      console.error('[DATA_INVENTORY]', {
        action: 'create_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
        code: error?.code || null,
      });
      res.status(error?.code === '23505' ? 409 : 500).json({
        success: false,
        message:
          error?.code === '23505'
            ? 'Ya existe un item para ese dominio y campo'
            : 'No se pudo crear el item de inventario',
      });
    }
  }
);

app.patch(
  '/api/admin/data-inventory/:id',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = dataInventoryUpdateSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de inventario invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No hay cambios para aplicar',
        });
        return;
      }

      const { data: existingItem, error: existingError } = await supabase
        .from('data_inventory_items')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingItem) {
        res.status(404).json({
          success: false,
          message: 'Item de inventario no encontrado',
        });
        return;
      }

      const { data, error } = await supabase
        .from('data_inventory_items')
        .update(parsed.data)
        .eq('id', id)
        .select(
          [
            'id',
            'data_domain',
            'field_name',
            'description',
            'data_category',
            'sensitivity_level',
            'source_type',
            'legal_basis',
            'purpose',
            'retention_policy',
            'retention_days',
            'impacts_scoring',
            'requires_consent',
            'is_public_source',
            'is_active',
            'created_at',
            'updated_at',
          ].join(', ')
        )
        .single();

      if (error || !data) {
        throw error || new Error('No se pudo actualizar el item de inventario');
      }

      console.log('[DATA_INVENTORY]', {
        action: 'updated',
        admin_user_id: req.user?.id || null,
        item_id: id,
        changed_fields: Object.keys(parsed.data),
      });

      res.json({
        success: true,
        item: data as unknown as DataInventoryItemRow,
      });
    } catch (error: any) {
      console.error('[DATA_INVENTORY]', {
        action: 'update_error',
        admin_user_id: req.user?.id || null,
        item_id: req.params.id,
        error: error instanceof Error ? error.message : 'unknown',
        code: error?.code || null,
      });
      res.status(error?.code === '23505' ? 409 : 500).json({
        success: false,
        message:
          error?.code === '23505'
            ? 'Ya existe un item para ese dominio y campo'
            : 'No se pudo actualizar el item de inventario',
      });
    }
  }
);

app.get(
  '/api/admin/audit-logs',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const page = clampNumber(parsePositiveInteger(req.query.page, 1), 1, 10000);
      const pageSize = clampNumber(parsePositiveInteger(req.query.pageSize, 25), 1, 100);
      const severityFilter = normalizeOptionalFilter(req.query.severity, 20);
      const actionTypeFilter = normalizeOptionalFilter(req.query.action_type, 160);
      const adminEmailFilter =
        normalizeOptionalFilter(req.query.admin_email, 180)?.toLowerCase() || null;
      const targetTypeFilter = normalizeOptionalFilter(req.query.target_type, 100);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('admin_audit_logs')
        .select(ADMIN_AUDIT_LOG_SELECT_COLUMNS.join(', '), { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (
        severityFilter &&
        ['low', 'medium', 'high', 'critical'].includes(severityFilter)
      ) {
        query = query.eq('severity', severityFilter);
      }

      if (actionTypeFilter) {
        query = query.ilike('action_type', `%${actionTypeFilter}%`);
      }

      if (adminEmailFilter) {
        query = query.ilike('admin_email', `%${adminEmailFilter}%`);
      }

      if (targetTypeFilter) {
        query = query.eq('target_type', targetTypeFilter);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        logs: (data || []) as unknown as AdminAuditLogRow[],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: count && count > 0 ? Math.ceil(count / pageSize) : 0,
        },
      });
    } catch (error) {
      console.error('[ADMIN_AUDIT]', {
        action: 'admin_list_error',
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo cargar la auditoria administrativa',
      });
    }
  }
);

app.get(
  '/api/admin/report-actions',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const { data: actions, error } = await supabase
        .from('admin_report_actions')
        .select(`
          id,
          report_id,
          rental_history_id,
          admin_user_id,
          accion,
          action,
          fecha_accion,
          timestamp
        `)
        .order('timestamp', { ascending: false, nullsFirst: false })
        .order('fecha_accion', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      const actionList = (actions || []) as AdminActionRow[];
      const normalizedPrimaryActions: UnifiedAdminDecisionAction[] = actionList
        .map((action) => {
          const actionName =
            action.action ||
            (action.accion === 'aprobado'
              ? 'report_approved'
              : action.accion === 'rechazado'
                ? 'report_rejected'
                : action.accion) ||
            'admin_action';
          const timestamp = action.timestamp || action.fecha_accion;
          const resourceType: 'report' | 'rental_history' = action.rental_history_id
            ? 'rental_history'
            : 'report';

          return {
            id: action.id,
            action: actionName,
            accion: action.accion,
            admin_user_id: action.admin_user_id,
            report_id: action.report_id || null,
            rental_history_id: action.rental_history_id || null,
            timestamp,
            fecha_accion: action.fecha_accion || timestamp,
            resource_type: resourceType,
            resource_label: resourceType === 'rental_history' ? 'Historial arrendaticio' : 'Reporte',
            resource_summary: null,
          };
        })
        .filter((action) => Boolean(action.timestamp));

      const { data: auditRows, error: auditError } = await supabase
        .from('admin_audit_logs')
        .select('id, admin_user_id, action_type, target_type, target_id, target_reference, reason, created_at')
        .eq('target_type', 'report')
        .ilike('action_type', 'report_review.%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (auditError && !isMissingSchemaError(auditError)) {
        throw auditError;
      }

      const normalizedAuditActions: UnifiedAdminDecisionAction[] = ((auditRows || []) as Array<{
        id: string;
        admin_user_id: string | null;
        action_type: string;
        target_id: string | null;
        target_reference: string | null;
        reason: string | null;
        created_at: string;
      }>).map((row) => {
        const actionName = row.action_type.replace(/^report_review\./, '');

        return {
          id: `audit:${row.id}`,
          action: actionName,
          accion:
            actionName === 'approve'
              ? 'aprobado'
              : actionName === 'reject'
                ? 'rechazado'
                : actionName,
          admin_user_id: row.admin_user_id,
          report_id: row.target_id,
          rental_history_id: null,
          timestamp: row.created_at,
          fecha_accion: row.created_at,
          resource_type: 'report',
          resource_label: 'Reporte',
          resource_summary: row.reason || row.target_reference,
        };
      });

      const { data: reviewLogRows, error: reviewLogError } = await supabase
        .from('report_review_logs')
        .select('id, report_id, admin_id, previous_status, new_status, previous_scoring_eligibility_status, new_scoring_eligibility_status, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (reviewLogError && !isMissingSchemaError(reviewLogError)) {
        throw reviewLogError;
      }

      const normalizedReviewLogActions: UnifiedAdminDecisionAction[] = ((reviewLogRows || []) as Array<{
        id: string;
        report_id: string;
        admin_id: string | null;
        previous_status: string | null;
        new_status: string;
        previous_scoring_eligibility_status: string | null;
        new_scoring_eligibility_status: string | null;
        notes: string | null;
        created_at: string;
      }>).map((row) => {
        const actionName =
          row.new_status === 'verified'
            ? 'approve'
            : row.new_status === 'rejected'
              ? 'reject'
              : row.new_status === 'needs_more_info'
                ? 'request_more_info'
                : row.new_scoring_eligibility_status === 'blocked' &&
                    row.previous_scoring_eligibility_status !== 'blocked'
                  ? 'block_scoring'
                  : row.new_status === 'in_review'
                    ? 'mark_in_review'
                    : `report_status_${row.new_status}`;

        return {
          id: `review:${row.id}`,
          action: actionName,
          accion:
            actionName === 'approve'
              ? 'aprobado'
              : actionName === 'reject'
                ? 'rechazado'
                : actionName,
          admin_user_id: row.admin_id,
          report_id: row.report_id,
          rental_history_id: null,
          timestamp: row.created_at,
          fecha_accion: row.created_at,
          resource_type: 'report',
          resource_label: 'Reporte',
          resource_summary: row.notes,
        };
      });

      const primaryActions = normalizedPrimaryActions;
      const hasNearbyPrimaryAction = (candidate: UnifiedAdminDecisionAction) =>
        primaryActions.some((primary) => {
          if (primary.resource_type !== candidate.resource_type) return false;
          if ((primary.report_id || null) !== (candidate.report_id || null)) return false;
          if ((primary.rental_history_id || null) !== (candidate.rental_history_id || null)) {
            return false;
          }
          if ((primary.admin_user_id || null) !== (candidate.admin_user_id || null)) return false;
          if (primary.action !== candidate.action) return false;

          return (
            Math.abs(
              new Date(primary.timestamp).getTime() - new Date(candidate.timestamp).getTime()
            ) <= 10 * 60 * 1000
          );
        });

      const unifiedActions = [
        ...primaryActions,
        ...normalizedAuditActions.filter((action) => !hasNearbyPrimaryAction(action)),
        ...normalizedReviewLogActions.filter((action) => !hasNearbyPrimaryAction(action)),
      ]
        .filter((action) => action.report_id || action.rental_history_id)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 50);

      const adminIds = Array.from(
        new Set(
          unifiedActions
            .map((action) => action.admin_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const reportIds = Array.from(
        new Set(
          unifiedActions
            .map((action) => action.report_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const rentalHistoryIds = Array.from(
        new Set(
          unifiedActions
            .map((action) => action.rental_history_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let adminsById: Record<string, AdminReporterUser> = {};
      let reportsById: Record<string, AdminActionReportRow> = {};
      let rentalHistoriesById: Record<string, AdminActionRentalHistoryRow> = {};

      if (adminIds.length > 0) {
        const { data: admins, error: adminsError } = await supabase
          .from('users')
          .select('id, nombre, email, tipo_usuario')
          .in('id', adminIds);

        if (adminsError) {
          throw adminsError;
        }

        adminsById = (admins || []).reduce((acc, admin) => {
          acc[admin.id] = admin;
          return acc;
        }, {} as Record<string, AdminReporterUser>);
      }

      if (reportIds.length > 0) {
        const { data: reports, error: reportsError } = await supabase
          .from('reports')
          .select('id, tipo_problema, descripcion, estado, reportado_por')
          .in('id', reportIds);

        if (reportsError) {
          throw reportsError;
        }

        reportsById = (reports || []).reduce((acc, report) => {
          acc[report.id] = report;
          return acc;
        }, {} as Record<string, AdminActionReportRow>);
      }

      if (rentalHistoryIds.length > 0) {
        const { data: rentalHistories, error: rentalHistoriesError } = await supabase
          .from('tenant_rental_histories')
          .select('id, cedula_inquilino, lessor_name, city, property_type, status')
          .in('id', rentalHistoryIds);

        if (rentalHistoriesError) {
          throw rentalHistoriesError;
        }

        rentalHistoriesById = (rentalHistories || []).reduce((acc, rentalHistory) => {
          acc[rentalHistory.id] = rentalHistory;
          return acc;
        }, {} as Record<string, AdminActionRentalHistoryRow>);
      }

      const enrichedActions = unifiedActions.map((action) => {
        const report = action.report_id ? reportsById[action.report_id] || null : null;
        const rentalHistory = action.rental_history_id
          ? rentalHistoriesById[action.rental_history_id] || null
          : null;

        return {
          ...action,
          resource_label:
            action.resource_type === 'report'
              ? report
                ? `Reporte: ${report.tipo_problema}`
                : 'Reporte'
              : 'Historial arrendaticio',
          resource_summary:
            action.resource_summary ||
            (report ? report.descripcion : null) ||
            (rentalHistory
              ? [rentalHistory.lessor_name, rentalHistory.city, rentalHistory.property_type]
                  .filter(Boolean)
                  .join(' · ') || null
              : null),
          admin: action.admin_user_id ? adminsById[action.admin_user_id] || null : null,
          report,
          rental_history: rentalHistory,
        };
      });

      res.json({
        success: true,
        actions: enrichedActions,
      });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/report-actions',
          table: 'admin_report_actions',
          operation: 'select',
          error,
          body: {
            actions: [],
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/report-actions',
        table: 'admin_report_actions',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

app.get(
  '/api/admin/legal-case-signals',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const { data: signals, error } = await supabase
        .from('legal_case_signals')
        .select(`
          ${LEGAL_CASE_SIGNAL_SELECT_COLUMNS.join(',')},
          tenants (
            id,
            nombre,
            cedula,
            ciudad
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        signals: (signals || []) as unknown as LegalCaseSignalRow[],
      });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendAdminEmptyList(res, {
          endpoint: '/api/admin/legal-case-signals',
          table: 'legal_case_signals',
          operation: 'select',
          error,
          body: {
            signals: [],
          },
        });
        return;
      }

      logAdminEndpointError({
        endpoint: '/api/admin/legal-case-signals',
        table: 'legal_case_signals',
        operation: 'select',
        error,
      });
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

app.patch(
  '/api/admin/legal-case-signals/:id',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const adminUserId = req.user?.id;
      const body = (req.body || {}) as LegalCaseSignalPatchBody;
      const legalTraceInput = legalTracePatchSchema.safeParse({
        data_origin: req.body?.data_origin,
        source_type: req.body?.source_type,
        source_name: req.body?.source_name,
        source_reference: req.body?.source_reference,
        source_url: req.body?.source_url,
        legal_basis: req.body?.legal_basis,
        public_source_flag: req.body?.public_source_flag,
        impacts_scoring: req.body?.impacts_scoring,
        dispute_status: req.body?.dispute_status,
        legal_review_status: req.body?.legal_review_status,
        legal_notes: req.body?.legal_notes,
      });

      if (!legalTraceInput.success) {
        res.status(400).json({
          success: false,
          message: 'Metadata legal invalida',
          errors: legalTraceInput.error.flatten(),
        });
        return;
      }

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      const { data: existingSignal, error: existingError } = await supabase
        .from('legal_case_signals')
        .select(LEGAL_CASE_SIGNAL_SELECT_COLUMNS.join(', '))
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingSignal) {
        res.status(404).json({
          success: false,
          message: 'Señal judicial no encontrada',
        });
        return;
      }

      const existingSignalRow = existingSignal as unknown as LegalCaseSignalRow;
      const updatePayload: Record<string, any> = buildLegalTracePayload(legalTraceInput.data);

      if (body.status) {
        updatePayload.status = body.status;

        if (body.status === 'verified') {
          updatePayload.verified_by_admin_id = adminUserId;
          updatePayload.verified_at = new Date().toISOString();
          updatePayload.rejected_by_admin_id = null;
          updatePayload.rejected_at = null;
          updatePayload.legal_review_status = 'approved';
        }

        if (body.status === 'rejected') {
          updatePayload.rejected_by_admin_id = adminUserId;
          updatePayload.rejected_at = new Date().toISOString();
          updatePayload.score_impact_enabled = false;
          updatePayload.relevance_for_rental_risk = false;
          updatePayload.legal_review_status = 'rejected';
        }

        if (body.status === 'under_review') {
          updatePayload.score_impact_enabled = false;
        }
      }

      if (typeof body.relevance_for_rental_risk === 'boolean') {
        updatePayload.relevance_for_rental_risk = body.relevance_for_rental_risk;
      }

      if (typeof body.score_impact_enabled === 'boolean') {
        updatePayload.score_impact_enabled = body.score_impact_enabled;
      }

      if (body.verification_notes !== undefined) {
        updatePayload.verification_notes = body.verification_notes;
      }

      if (body.dispute_status) {
        updatePayload.dispute_status = body.dispute_status;

        if (body.dispute_status === 'disputed') {
          updatePayload.disputed_at = new Date().toISOString();
          updatePayload.score_impact_enabled = false;
        }

        if (body.dispute_status === 'resolved' && existingSignalRow.dispute_status === 'disputed') {
          updatePayload.disputed_at = existingSignalRow.disputed_at || new Date().toISOString();
        }
      }

      if (body.dispute_notes !== undefined) {
        updatePayload.dispute_notes = body.dispute_notes;
      }

      const { data: updatedSignal, error: updateError } = await supabase
        .from('legal_case_signals')
        .update(updatePayload)
        .eq('id', id)
        .select(LEGAL_CASE_SIGNAL_SELECT_COLUMNS.join(', '))
        .single();

      if (updateError || !updatedSignal) {
        throw updateError || new Error('No se pudo actualizar la señal judicial');
      }

      const updatedSignalRow = updatedSignal as unknown as LegalCaseSignalRow;
      const shouldRecalc = shouldRecalculateScore(existingSignalRow, updatedSignalRow);

      if (shouldRecalc) {
        try {
          const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('id, cedula')
            .eq('id', updatedSignalRow.tenant_id)
            .maybeSingle();

          if (tenantError) {
            throw tenantError;
          }

          if (tenantData) {
            await calculateAndStoreScore(
              tenantData.id,
              updatedSignalRow.cedula_consultada || tenantData.cedula
            );
          }
        } catch (scoreError) {
          console.error('⚠️ Error recalculando score desde legal_case_signals:', scoreError);
          res.status(500).json({
            success: false,
            message: 'La señal fue actualizada, pero falló el recálculo automático del score',
          });
          return;
        }
      }

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: body.status
          ? `legal_signal.status.${body.status}`
          : body.dispute_status
            ? `legal_signal.dispute.${body.dispute_status}`
            : 'legal_signal.update',
        severity:
          body.status === 'verified' ||
          body.status === 'rejected' ||
          body.dispute_status === 'disputed' ||
          body.dispute_status === 'resolved'
            ? 'high'
            : 'medium',
        target: {
          type: 'legal_case_signal',
          id,
          reference: updatedSignalRow.source_reference || updatedSignalRow.cedula_consultada,
        },
        previous_state: {
          status: existingSignalRow.status,
          dispute_status: existingSignalRow.dispute_status,
          legal_review_status: existingSignalRow.legal_review_status,
          relevance_for_rental_risk: existingSignalRow.relevance_for_rental_risk,
          score_impact_enabled: existingSignalRow.score_impact_enabled,
        },
        new_state: {
          status: updatedSignalRow.status,
          dispute_status: updatedSignalRow.dispute_status,
          legal_review_status: updatedSignalRow.legal_review_status,
          relevance_for_rental_risk: updatedSignalRow.relevance_for_rental_risk,
          score_impact_enabled: updatedSignalRow.score_impact_enabled,
          changed_fields: Object.keys(updatePayload),
          score_recalculated: shouldRecalc,
        },
        reason:
          body.verification_notes ||
          body.dispute_notes ||
          legalTraceInput.data.legal_notes ||
          null,
      });

      res.json({
        success: true,
        message: 'Señal judicial actualizada exitosamente',
        signal: updatedSignalRow,
      });
    } catch (error) {
      console.error('Error al actualizar legal_case_signal:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

app.patch(
  '/api/admin/reports/:id',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = legalTracePatchSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Metadata legal invalida',
          errors: parsed.error.flatten(),
        });
        return;
      }

      const updatePayload = buildLegalTracePayload(parsed.data);

      if (Object.keys(updatePayload).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No hay cambios de trazabilidad para aplicar',
        });
        return;
      }

      const { data: existingReport, error: existingError } = await supabase
        .from('reports')
        .select(
          [
            'id',
            'data_origin',
            'source_type',
            'source_name',
            'source_reference',
            'source_url',
            'legal_basis',
            'public_source_flag',
            'impacts_scoring',
            'dispute_status',
            'legal_review_status',
          ].join(', ')
        )
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingReport) {
        res.status(404).json({
          success: false,
          message: 'Reporte no encontrado',
        });
        return;
      }

      const { data: report, error } = await supabase
        .from('reports')
        .update(updatePayload)
        .eq('id', id)
        .select(REPORT_SELECT_COLUMNS.join(', '))
        .single();

      if (error || !report) {
        throw error || new Error('No se pudo actualizar la trazabilidad del reporte');
      }

      console.log('[LEGAL_TRACEABILITY]', {
        action: 'report_trace_updated',
        report_id: id,
        admin_user_id: req.user?.id || null,
        changed_fields: Object.keys(updatePayload),
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: 'report_legal_trace.update',
        severity: 'medium',
        target: {
          type: 'report',
          id,
          reference: ((report as unknown) as Record<string, unknown>).source_reference as
            | string
            | undefined,
        },
        previous_state: existingReport,
        new_state: {
          id,
          ...updatePayload,
          changed_fields: Object.keys(updatePayload),
        },
        reason: normalizeNullableText(req.body?.legal_notes, 1000),
      });

      res.json({
        success: true,
        report: report as unknown as AdminReportRow,
      });
    } catch (error) {
      console.error('[LEGAL_TRACEABILITY]', {
        action: 'report_trace_update_error',
        report_id: req.params.id,
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la trazabilidad del reporte',
      });
    }
  }
);

app.patch(
  '/api/admin/reports/:id/review',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const adminUserId = req.user?.id;
      const parsed = adminReportReviewSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de revision invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      const { data: existingReport, error: existingError } = await supabase
        .from('reports')
        .select(
          [
            'id',
            'tenant_id',
            'tipo_problema',
            'estado',
            'legal_basis',
            'report_verification_status',
            'scoring_eligibility_status',
            'subject_notice_required',
            'subject_notice_status',
            'contradiction_status',
            'contradiction_deadline',
            'tenants (cedula)',
          ].join(', ')
        )
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingReport) {
        res.status(404).json({
          success: false,
          message: 'Reporte no encontrado',
        });
        return;
      }

      const action = parsed.data.action as ReportReviewAction;
      const existingReportRow = existingReport as unknown as {
        id: string;
        tenant_id: string | null;
        tipo_problema: string | null;
        estado: string;
        legal_basis: string | null;
        report_verification_status: ReportVerificationStatus | null;
        scoring_eligibility_status: ScoringEligibilityStatus | null;
        subject_notice_required: boolean | null;
        subject_notice_status: SubjectNoticeStatus | null;
        contradiction_status: ContradictionStatus | null;
        contradiction_deadline: string | null;
        tenants?: { cedula: string | null } | { cedula: string | null }[] | null;
      };
      const previousStatus =
        existingReportRow.report_verification_status ||
        'pending_verification';
      const previousScoringEligibilityStatus =
        existingReportRow.scoring_eligibility_status ||
        'not_eligible';
      const nowISO = new Date().toISOString();
      const notes = normalizeNullableText(parsed.data.notes, 2000);
      const rejectionReason = normalizeNullableText(parsed.data.rejection_reason, 2000);
      const updatePayload: Record<string, unknown> = {
        reviewed_by_admin_id: adminUserId,
        reviewed_at: nowISO,
      };
      let nextStatus: ReportVerificationStatus = previousStatus;
      let nextScoringEligibilityStatus: ScoringEligibilityStatus =
        previousScoringEligibilityStatus;
      let message = 'Revision de reporte actualizada';

      if (notes !== undefined) {
        updatePayload.legal_review_notes = notes;
      }

      switch (action) {
        case 'mark_in_review':
          nextStatus = 'in_review';
          nextScoringEligibilityStatus = 'not_eligible';
          updatePayload.legal_review_status = 'pending';
          message = 'Reporte marcado en revision';
          break;
        case 'request_more_info':
          nextStatus = 'needs_more_info';
          nextScoringEligibilityStatus = 'not_eligible';
          updatePayload.legal_review_status = 'needs_more_info';
          message = 'Se solicito mas informacion para el reporte';
          break;
        case 'approve':
          nextStatus = 'verified';
          nextScoringEligibilityStatus = isNoticeContradictionResolvedForScoring(existingReportRow)
            ? 'eligible'
            : 'not_eligible';
          updatePayload.estado = 'aprobado';
          updatePayload.verified_by_admin_id = adminUserId;
          updatePayload.verified_at = nowISO;
          updatePayload.legal_review_status = 'approved';
          updatePayload.rejection_reason = null;
          message =
            nextScoringEligibilityStatus === 'eligible'
              ? 'Reporte verificado y marcado elegible para scoring'
              : 'Reporte verificado; queda no elegible para scoring hasta completar notificacion/contradiccion';
          break;
        case 'reject':
          nextStatus = 'rejected';
          nextScoringEligibilityStatus = 'blocked';
          updatePayload.estado = 'rechazado';
          updatePayload.legal_review_status = 'rejected';
          updatePayload.rejection_reason = rejectionReason;
          message = 'Reporte rechazado y bloqueado para scoring';
          break;
        case 'block_scoring':
          nextScoringEligibilityStatus = 'blocked';
          updatePayload.legal_review_status =
            previousStatus === 'verified' ? 'reviewed' : 'pending';
          message = 'Scoring bloqueado para el reporte';
          break;
      }

      updatePayload.report_verification_status = nextStatus;
      updatePayload.scoring_eligibility_status = nextScoringEligibilityStatus;

      const { data: report, error: updateError } = await supabase
        .from('reports')
        .update(updatePayload)
        .eq('id', id)
        .select(REPORT_SELECT_COLUMNS.join(', '))
        .single();

      if (updateError || !report) {
        throw updateError || new Error('No se pudo actualizar la revision del reporte');
      }

      const logNotes =
        action === 'reject'
          ? [rejectionReason, notes].filter(Boolean).join('\n\n')
          : notes;

      const { error: logError } = await supabase
        .from('report_review_logs')
        .insert({
          report_id: id,
          admin_id: adminUserId,
          previous_status: previousStatus,
          new_status: nextStatus,
          previous_scoring_eligibility_status: previousScoringEligibilityStatus,
          new_scoring_eligibility_status: nextScoringEligibilityStatus,
          notes: logNotes || null,
        });

      if (logError) {
        throw logError;
      }

      const { data: reportAction, error: reportActionError } = await supabase
        .from('admin_report_actions')
        .insert({
          report_id: id,
          admin_user_id: adminUserId,
          action,
          accion:
            action === 'approve'
              ? 'aprobado'
              : action === 'reject'
                ? 'rechazado'
              : action,
          timestamp: nowISO,
          fecha_accion: nowISO,
        })
        .select('id')
        .maybeSingle();

      if (reportActionError) {
        console.error('[REPORT_REVIEW_ACTION_LOG_ERROR]', {
          report_id: id,
          admin_user_id: adminUserId,
          action,
          supabase_error: reportActionError,
          supabase_error_log: buildSupabaseErrorLog(reportActionError),
        });
      }

      const { data: reviewLogs, error: reviewLogsError } = await supabase
        .from('report_review_logs')
        .select(REPORT_REVIEW_LOG_SELECT_COLUMNS.join(', '))
        .eq('report_id', id)
        .order('created_at', { ascending: false });

      if (reviewLogsError) {
        throw reviewLogsError;
      }

      const reportRow = {
        ...((report as unknown) as AdminReportRow),
        report_review_logs: ((reviewLogs || []) as unknown) as ReportReviewLogRow[],
      };

      console.log('[REPORT_REVIEW]', {
        action,
        report_id: id,
        previous_status: previousStatus,
        next_status: nextStatus,
        previous_scoring_eligibility_status: previousScoringEligibilityStatus,
        next_scoring_eligibility_status: nextScoringEligibilityStatus,
        admin_user_id: adminUserId,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: `report_review.${action}`,
        severity:
          action === 'approve' || action === 'reject' || action === 'block_scoring'
            ? 'high'
            : 'medium',
        target: {
          type: 'report',
          id,
          reference: existingReportRow.estado,
        },
        previous_state: {
          estado: existingReportRow.estado,
          report_verification_status: previousStatus,
          scoring_eligibility_status: previousScoringEligibilityStatus,
          subject_notice_status: existingReportRow.subject_notice_status,
          contradiction_status: existingReportRow.contradiction_status,
        },
        new_state: {
          estado: ((report as unknown) as Record<string, unknown>).estado,
          report_verification_status: nextStatus,
          scoring_eligibility_status: nextScoringEligibilityStatus,
          legal_review_status: updatePayload.legal_review_status || null,
        },
        reason: logNotes || message,
      });

      await logLegalReportAudit({
        tenant_id: existingReportRow.tenant_id,
        report_id: reportRow.id,
        admin_action_id: ((reportAction as { id?: string } | null) || null)?.id || null,
        actor_user_id: adminUserId,
        actor_role: req.user?.tipo_usuario || 'admin',
        event_type: `report_review.${action}`,
        event_status: 'success',
        report_status_before: existingReportRow.estado,
        report_status_after: String(((report as unknown) as Record<string, unknown>).estado || ''),
        review_status_before: previousStatus,
        review_status_after: nextStatus,
        subject_document_number: getRelatedTenantCedula(existingReportRow.tenants),
        subject_document_type: 'cedula',
        report_type: existingReportRow.tipo_problema,
        legal_basis: existingReportRow.legal_basis,
        metadata: {
          scoring_eligibility_before: previousScoringEligibilityStatus,
          scoring_eligibility_after: nextScoringEligibilityStatus,
          legal_review_status_after: updatePayload.legal_review_status || null,
          reason_present: Boolean(logNotes),
        },
        request: buildLegalReportAuditRequest(req),
      });

      res.json({
        success: true,
        message,
        report: reportRow,
      });
    } catch (error) {
      console.error('[REPORT_REVIEW]', {
        action: 'review_update_error',
        report_id: req.params.id,
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      await logLegalReportAudit({
        report_id: req.params.id,
        actor_user_id: req.user?.id || null,
        actor_role: req.user?.tipo_usuario || 'admin',
        event_type: 'report_review.update',
        event_status: 'error',
        error_code: 'review_update_error',
        error_message: error instanceof Error ? error.message : 'unknown',
        request: buildLegalReportAuditRequest(req),
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la revision del reporte',
      });
    }
  }
);

app.post(
  '/api/admin/reports/:id/notice',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const adminUserId = req.user?.id;
      const parsed = adminReportNoticeSchema.safeParse(req.body ?? {});

      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Datos de notificacion invalidos',
          errors: parsed.error.flatten(),
        });
        return;
      }

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      const { data: existingReport, error: existingError } = await supabase
        .from('reports')
        .select(
          [
            'id',
            'tenant_id',
            'tipo_problema',
            'estado',
            'legal_basis',
            'report_verification_status',
            'scoring_eligibility_status',
            'subject_notice_required',
            'subject_notice_status',
            'contradiction_status',
            'contradiction_deadline',
            'tenants (cedula)',
          ].join(', ')
        )
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingReport) {
        res.status(404).json({
          success: false,
          message: 'Reporte no encontrado',
        });
        return;
      }

      const reportRow = existingReport as unknown as {
        id: string;
        tenant_id: string | null;
        tipo_problema: string | null;
        estado: string;
        legal_basis: string | null;
        report_verification_status: ReportVerificationStatus | null;
        scoring_eligibility_status: ScoringEligibilityStatus | null;
        subject_notice_required: boolean | null;
        subject_notice_status: SubjectNoticeStatus | null;
        contradiction_status: ContradictionStatus | null;
        contradiction_deadline: string | null;
        tenants?: { cedula: string | null } | { cedula: string | null }[] | null;
      };
      const tenantInfo = Array.isArray(reportRow.tenants)
        ? reportRow.tenants[0]
        : reportRow.tenants;
      const subjectDocumentNumber = String(tenantInfo?.cedula || '').trim();

      if (!subjectDocumentNumber) {
        res.status(409).json({
          success: false,
          message: 'No se pudo resolver el documento del titular reportado',
        });
        return;
      }

      const action = parsed.data.action as ReportNoticeAction;
      const now = new Date();
      const nowISO = now.toISOString();
      const deadlineISO = addCalendarDays(now, 10).toISOString();
      const notes = normalizeNullableText(parsed.data.notes, 2000);
      const contradictionSummary = normalizeNullableText(
        parsed.data.contradiction_summary,
        2500
      );
      const noticeChannel =
        normalizeNullableText(parsed.data.notice_channel, 80) || 'manual_admin';
      const noticeReference = normalizeNullableText(parsed.data.notice_reference, 250);
      const subjectEmail = normalizeNullableText(parsed.data.subject_email, 180);
      const updatePayload: Record<string, unknown> = {};
      const noticePayload: Record<string, unknown> = {
        report_id: id,
        subject_document_number: subjectDocumentNumber,
        subject_email: subjectEmail,
        notice_channel: noticeChannel,
        notice_reference: noticeReference,
        contradiction_summary: contradictionSummary || notes,
      };
      let message = 'Trazabilidad de notificacion actualizada';

      switch (action) {
        case 'mark_notice_sent':
          updatePayload.subject_notice_required = true;
          updatePayload.subject_notice_status = 'sent';
          updatePayload.contradiction_deadline = deadlineISO;
          noticePayload.notice_status = 'sent';
          noticePayload.notice_sent_at = nowISO;
          noticePayload.contradiction_deadline = deadlineISO;
          noticePayload.contradiction_status = reportRow.contradiction_status || 'none';
          message = 'Notificacion marcada como enviada';
          break;
        case 'mark_notice_failed':
          updatePayload.subject_notice_required = true;
          updatePayload.subject_notice_status = 'failed';
          updatePayload.scoring_eligibility_status = 'not_eligible';
          noticePayload.notice_status = 'failed';
          noticePayload.contradiction_status = reportRow.contradiction_status || 'none';
          message = 'Notificacion marcada como fallida';
          break;
        case 'waive_notice':
          updatePayload.subject_notice_required = false;
          updatePayload.subject_notice_status = 'waived';
          noticePayload.notice_status = 'waived';
          noticePayload.contradiction_status = reportRow.contradiction_status || 'none';
          message = 'Notificacion eximida con trazabilidad administrativa';
          break;
        case 'record_contradiction':
          updatePayload.contradiction_status = 'received';
          updatePayload.report_verification_status = 'in_review';
          updatePayload.scoring_eligibility_status = 'not_eligible';
          updatePayload.legal_review_status = 'pending';
          noticePayload.notice_status = reportRow.subject_notice_status || 'pending';
          noticePayload.contradiction_status = 'received';
          noticePayload.contradiction_received_at = nowISO;
          noticePayload.contradiction_deadline = reportRow.contradiction_deadline;
          message = 'Contradiccion registrada y reporte devuelto a revision';
          break;
        case 'mark_contradiction_accepted':
          updatePayload.contradiction_status = 'accepted';
          updatePayload.report_verification_status = 'rejected';
          updatePayload.scoring_eligibility_status = 'blocked';
          updatePayload.estado = 'rechazado';
          updatePayload.legal_review_status = 'rejected';
          updatePayload.rejection_reason =
            contradictionSummary || notes || 'Contradiccion aceptada por revision administrativa';
          noticePayload.notice_status = reportRow.subject_notice_status || 'pending';
          noticePayload.contradiction_status = 'accepted';
          noticePayload.contradiction_received_at = nowISO;
          noticePayload.contradiction_deadline = reportRow.contradiction_deadline;
          message = 'Contradiccion aceptada y scoring bloqueado';
          break;
        case 'mark_contradiction_rejected':
          updatePayload.contradiction_status = 'rejected';
          updatePayload.report_verification_status = 'in_review';
          updatePayload.scoring_eligibility_status = 'not_eligible';
          updatePayload.legal_review_status = 'pending';
          noticePayload.notice_status = reportRow.subject_notice_status || 'pending';
          noticePayload.contradiction_status = 'rejected';
          noticePayload.contradiction_deadline = reportRow.contradiction_deadline;
          message = 'Contradiccion rechazada; el reporte queda pendiente de decision admin';
          break;
        case 'mark_contradiction_expired':
          updatePayload.contradiction_status = 'expired';
          updatePayload.scoring_eligibility_status = 'not_eligible';
          noticePayload.notice_status = reportRow.subject_notice_status || 'sent';
          noticePayload.contradiction_status = 'expired';
          noticePayload.contradiction_deadline = reportRow.contradiction_deadline;
          message = 'Plazo de contradiccion marcado como expirado';
          break;
      }

      const { error: noticeError } = await supabase
        .from('report_subject_notices')
        .insert(noticePayload);

      if (noticeError) {
        throw noticeError;
      }

      const { data: report, error: updateError } = await supabase
        .from('reports')
        .update(updatePayload)
        .eq('id', id)
        .select(REPORT_SELECT_COLUMNS.join(', '))
        .single();

      if (updateError || !report) {
        throw updateError || new Error('No se pudo actualizar notificacion del reporte');
      }

      const updatedReportRow = report as unknown as AdminReportRow;

      const { data: subjectNotices, error: subjectNoticesError } = await supabase
        .from('report_subject_notices')
        .select(REPORT_SUBJECT_NOTICE_SELECT_COLUMNS.join(', '))
        .eq('report_id', id)
        .order('created_at', { ascending: false });

      if (subjectNoticesError) {
        throw subjectNoticesError;
      }

      console.log('[REPORT_NOTICE]', {
        action,
        report_id: id,
        admin_user_id: adminUserId,
      });

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: `report_notice.${action}`,
        severity:
          action === 'mark_contradiction_accepted' ||
          action === 'record_contradiction' ||
          action === 'waive_notice'
            ? 'high'
            : 'medium',
        target: {
          type: 'report',
          id,
          reference: subjectDocumentNumber,
        },
        previous_state: {
          subject_notice_required: reportRow.subject_notice_required,
          subject_notice_status: reportRow.subject_notice_status,
          contradiction_status: reportRow.contradiction_status,
          contradiction_deadline: reportRow.contradiction_deadline,
          scoring_eligibility_status: reportRow.scoring_eligibility_status,
          report_verification_status: reportRow.report_verification_status,
        },
        new_state: {
          subject_notice_required:
            updatePayload.subject_notice_required ?? reportRow.subject_notice_required,
          subject_notice_status:
            updatePayload.subject_notice_status ?? reportRow.subject_notice_status,
          contradiction_status:
            updatePayload.contradiction_status ?? reportRow.contradiction_status,
          contradiction_deadline:
            updatePayload.contradiction_deadline ?? reportRow.contradiction_deadline,
          scoring_eligibility_status:
            updatePayload.scoring_eligibility_status ?? reportRow.scoring_eligibility_status,
          report_verification_status:
            updatePayload.report_verification_status ?? reportRow.report_verification_status,
        },
        reason: contradictionSummary || notes || message,
      });

      await logLegalReportAudit({
        tenant_id: reportRow.tenant_id,
        report_id: updatedReportRow.id,
        actor_user_id: adminUserId,
        actor_role: req.user?.tipo_usuario || 'admin',
        event_type: `report_notice.${action}`,
        event_status: 'success',
        report_status_before: reportRow.estado,
        report_status_after: String(((report as unknown) as Record<string, unknown>).estado || ''),
        review_status_before: reportRow.report_verification_status,
        review_status_after: String(
          updatePayload.report_verification_status ?? reportRow.report_verification_status ?? ''
        ),
        subject_document_number: subjectDocumentNumber,
        subject_document_type: 'cedula',
        report_type: reportRow.tipo_problema,
        legal_basis: reportRow.legal_basis,
        metadata: {
          subject_notice_status_before: reportRow.subject_notice_status,
          subject_notice_status_after:
            updatePayload.subject_notice_status ?? reportRow.subject_notice_status,
          contradiction_status_before: reportRow.contradiction_status,
          contradiction_status_after:
            updatePayload.contradiction_status ?? reportRow.contradiction_status,
          scoring_eligibility_before: reportRow.scoring_eligibility_status,
          scoring_eligibility_after:
            updatePayload.scoring_eligibility_status ?? reportRow.scoring_eligibility_status,
          notice_channel: noticeChannel,
          notice_reference_present: Boolean(noticeReference),
          subject_email_present: Boolean(subjectEmail),
        },
        request: buildLegalReportAuditRequest(req),
      });

      res.json({
        success: true,
        message,
        report: {
          ...updatedReportRow,
          subject_notices: ((subjectNotices || []) as unknown) as ReportSubjectNoticeRow[],
        },
      });
    } catch (error) {
      console.error('[REPORT_NOTICE]', {
        action: 'notice_update_error',
        report_id: req.params.id,
        admin_user_id: req.user?.id || null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      await logLegalReportAudit({
        report_id: req.params.id,
        actor_user_id: req.user?.id || null,
        actor_role: req.user?.tipo_usuario || 'admin',
        event_type: 'report_notice.update',
        event_status: 'error',
        error_code: 'notice_update_error',
        error_message: error instanceof Error ? error.message : 'unknown',
        request: buildLegalReportAuditRequest(req),
      });
      res.status(500).json({
        success: false,
        message: 'No se pudo actualizar la notificacion/contradiccion del reporte',
      });
    }
  }
);

app.put(
  '/api/admin/reports/:id',
  authenticateToken,
  requireAdmin,
  requireRecentAdminMfa,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { estado } = req.body ?? {};
      const adminUserId = req.user?.id;

      if (!['aprobado', 'rechazado'].includes(String(estado))) {
        res.status(400).json({
          success: false,
          message: 'Estado inválido',
        });
        return;
      }

      if (!adminUserId) {
        res.status(401).json({
          success: false,
          message: 'Usuario admin no autenticado',
        });
        return;
      }

      const { data: existingReport, error: existingError } = await supabase
        .from('reports')
        .select(
          [
            'id',
            'tenant_id',
            'tipo_problema',
            'estado',
            'legal_basis',
            'report_verification_status',
            'scoring_eligibility_status',
            'subject_notice_required',
            'subject_notice_status',
            'contradiction_status',
            'tenants (cedula)',
          ].join(', ')
        )
        .eq('id', id)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingReport) {
        res.status(404).json({
          success: false,
          message: 'Reporte no encontrado',
        });
        return;
      }

      const existingReportForLegacy = existingReport as unknown as {
        tenant_id: string | null;
        tipo_problema: string | null;
        estado: string;
        legal_basis: string | null;
        report_verification_status: ReportVerificationStatus | null;
        scoring_eligibility_status: ScoringEligibilityStatus | null;
        subject_notice_required: boolean | null;
        subject_notice_status: SubjectNoticeStatus | null;
        contradiction_status: ContradictionStatus | null;
        tenants?: { cedula: string | null } | { cedula: string | null }[] | null;
      };

      if (existingReportForLegacy.estado !== 'pendiente') {
        res.status(409).json({
          success: false,
          message: 'El reporte ya fue procesado previamente',
        });
        return;
      }

      const legacyScoringEligibility =
        estado === 'aprobado' && isNoticeContradictionResolvedForScoring(existingReportForLegacy)
          ? 'eligible'
          : estado === 'aprobado'
            ? 'not_eligible'
            : 'blocked';
      const reportUpdatePayload: Record<string, unknown> = {
        estado,
        verified_by_admin_id: adminUserId,
        verified_at: new Date().toISOString(),
        legal_review_status: estado === 'aprobado' ? 'approved' : 'rejected',
        reviewed_by_admin_id: adminUserId,
        reviewed_at: new Date().toISOString(),
        report_verification_status: estado === 'aprobado' ? 'verified' : 'rejected',
        scoring_eligibility_status: legacyScoringEligibility,
        rejection_reason:
          estado === 'rechazado'
            ? normalizeNullableText(req.body?.rejection_reason, 2000) ||
              'Rechazado por revision administrativa'
            : null,
      };

      const { data: report, error } = await supabase
        .from('reports')
        .update(reportUpdatePayload)
        .eq('id', id)
        .select(REPORT_SELECT_COLUMNS.join(', '))
        .single();

      if (error || !report) {
        throw error || new Error('No se pudo actualizar el reporte');
      }

      const reportRow = report as unknown as AdminReportRow;

      const { data: adminReportAction, error: auditError } = await supabase
        .from('admin_report_actions')
        .insert({
          report_id: id,
          admin_user_id: adminUserId,
          accion: estado,
          fecha_accion: new Date().toISOString(),
          action: estado === 'aprobado' ? 'report_approved' : 'report_rejected',
          timestamp: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (auditError) {
        console.error('⚠️ Error guardando auditoría admin:', auditError);
      }

      const { error: reviewLogError } = await supabase
        .from('report_review_logs')
        .insert({
          report_id: id,
          admin_id: adminUserId,
          previous_status: existingReportForLegacy.report_verification_status || 'pending_verification',
          new_status: estado === 'aprobado' ? 'verified' : 'rejected',
          previous_scoring_eligibility_status:
            existingReportForLegacy.scoring_eligibility_status || 'not_eligible',
          new_scoring_eligibility_status: legacyScoringEligibility,
          notes:
            estado === 'rechazado'
              ? reportUpdatePayload.rejection_reason
              : 'Revision administrativa heredada',
        });

      if (reviewLogError) {
        throw reviewLogError;
      }

      if (estado === 'aprobado') {
        try {
          const { data: tenantData, error: tenantReadError } = await supabase
            .from('tenants')
            .select('id, cedula')
            .eq('id', reportRow.tenant_id)
            .maybeSingle();

          if (tenantReadError) {
            throw tenantReadError;
          }

          if (tenantData) {
            console.log('[REPORT_REVIEW]', {
              action: 'legacy_admin_approve_no_score_recalculation',
              report_id: id,
              tenant_id: tenantData.id,
            });
          }
        } catch (scoreRecalcError) {
          console.error('Error registrando aprobacion heredada sin recalculo de score:', scoreRecalcError);
        }
      }

      await logAdminAction({
        ...buildAdminAuditContext(req),
        action_type: estado === 'aprobado' ? 'report_review.legacy_approve' : 'report_review.legacy_reject',
        severity: 'high',
        target: {
          type: 'report',
          id,
          reference: estado,
        },
        previous_state: {
          estado: existingReportForLegacy.estado,
          report_verification_status: existingReportForLegacy.report_verification_status,
          scoring_eligibility_status: existingReportForLegacy.scoring_eligibility_status,
          subject_notice_status: existingReportForLegacy.subject_notice_status,
          contradiction_status: existingReportForLegacy.contradiction_status,
        },
        new_state: {
          estado,
          report_verification_status: reportUpdatePayload.report_verification_status,
          scoring_eligibility_status: reportUpdatePayload.scoring_eligibility_status,
          legal_review_status: reportUpdatePayload.legal_review_status,
        },
        reason: (reportUpdatePayload.rejection_reason as string | null) || 'Revision administrativa heredada',
      });

      await logLegalReportAudit({
        tenant_id: existingReportForLegacy.tenant_id,
        report_id: reportRow.id,
        admin_action_id:
          ((adminReportAction as { id?: string } | null) || null)?.id || null,
        actor_user_id: adminUserId,
        actor_role: req.user?.tipo_usuario || 'admin',
        event_type:
          estado === 'aprobado' ? 'report_review.legacy_approve' : 'report_review.legacy_reject',
        event_status: 'success',
        report_status_before: existingReportForLegacy.estado,
        report_status_after: estado,
        review_status_before:
          existingReportForLegacy.report_verification_status || 'pending_verification',
        review_status_after:
          estado === 'aprobado' ? 'verified' : 'rejected',
        subject_document_number: getRelatedTenantCedula(existingReportForLegacy.tenants),
        subject_document_type: 'cedula',
        report_type: existingReportForLegacy.tipo_problema,
        legal_basis: existingReportForLegacy.legal_basis,
        metadata: {
          scoring_eligibility_before:
            existingReportForLegacy.scoring_eligibility_status || 'not_eligible',
          scoring_eligibility_after: legacyScoringEligibility,
          legal_review_status_after: reportUpdatePayload.legal_review_status,
          legacy_endpoint: true,
        },
        request: buildLegalReportAuditRequest(req),
      });

      res.json({
        success: true,
        message: `Reporte ${estado === 'aprobado' ? 'aprobado' : 'rechazado'} exitosamente`,
        report: reportRow,
      });
    } catch (error) {
      console.error('Error al actualizar reporte:', error);
      await logLegalReportAudit({
        report_id: req.params.id,
        actor_user_id: req.user?.id || null,
        actor_role: req.user?.tipo_usuario || 'admin',
        event_type: 'report_review.legacy_update',
        event_status: 'error',
        error_code: 'legacy_report_update_error',
        error_message: error instanceof Error ? error.message : 'unknown',
        request: buildLegalReportAuditRequest(req),
      });
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

// ================================
// 404 / ERROR HANDLERS
// ================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path,
  });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
  });
});

// ================================
// SERVER START
// ================================

app.listen(Number(PORT), async () => {
  console.log(`🚀 Servidor InmoScore corriendo en puerto ${PORT}`);

  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Conexión a Supabase establecida');
  } catch (err) {
    console.error('❌ Error conectando a Supabase:', err);
  }
});
