"use client";

import { Fragment, type FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ActionBanner } from "@/components/ui/ActionBanner";
import { DataTableShell } from "@/components/ui/DataTableShell";
import { MetricCard as SystemMetricCard } from "@/components/ui/MetricCard";
import { PageContainer } from "@/components/ui/PageContainer";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge as SystemStatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { emailVerificationFetch as fetch } from "@/lib/emailVerification";
import {
  IdentityVerificationActionController,
  type IdentityVerificationPatchResult,
  type PendingIdentityVerificationAction,
} from "./identityVerificationAction";

type AdminReporterUser = {
  id: string;
  nombre: string;
  email: string;
  tipo_usuario: string;
};

type LegalTraceSourceType =
  | "user_provided"
  | "admin_provided"
  | "public_registry"
  | "judicial_public_source"
  | "third_party_report"
  | "system_generated";

type LegalTraceLegalBasis =
  | "consent"
  | "public_source"
  | "legitimate_interest"
  | "contract"
  | "legal_obligation";

type LegalTraceDisputeStatus = "none" | "disputed" | "resolved" | "rejected";

type LegalTraceReviewStatus =
  | "pending"
  | "reviewed"
  | "approved"
  | "rejected"
  | "needs_more_info";

type LegalTracePayload = {
  data_origin?: string | null;
  source_type?: LegalTraceSourceType | null;
  source_name?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  legal_basis?: LegalTraceLegalBasis | null;
  public_source_flag?: boolean | null;
  impacts_scoring?: boolean | null;
  dispute_status?: LegalTraceDisputeStatus | null;
  legal_review_status?: LegalTraceReviewStatus | null;
  legal_notes?: string | null;
};

type LegalTraceView = {
  data_origin?: string | null;
  source_type?: LegalTraceSourceType | null;
  source_name?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  legal_basis?: LegalTraceLegalBasis | null;
  public_source_flag?: boolean | null;
  impacts_scoring?: boolean | null;
  dispute_status?: LegalTraceDisputeStatus | null;
  legal_review_status?: LegalTraceReviewStatus | null;
  legal_notes?: string | null;
};

type AdminReport = {
  id: string;
  tenant_id: string;
  tipo_problema: string;
  descripcion: string;
  fecha_reporte: string;
  estado: "pendiente" | "aprobado" | "rechazado";
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
  subject_notice_status?: string | null;
  contradiction_status?: string | null;
  contradiction_deadline?: string | null;
  tenants?: {
    nombre: string;
    cedula: string;
    ciudad: string;
  } | null;
  users?: AdminReporterUser | null;
  evidence_files?: ReportEvidenceFile[];
  report_review_logs?: ReportReviewLog[];
  subject_notices?: ReportSubjectNotice[];
};

type ReportReviewAction =
  | "mark_in_review"
  | "request_more_info"
  | "approve"
  | "reject"
  | "block_scoring";

type ReportReviewLog = {
  id: string;
  report_id: string;
  admin_id: string;
  previous_status: string | null;
  new_status: string;
  previous_scoring_eligibility_status: string | null;
  new_scoring_eligibility_status: string;
  notes: string | null;
  created_at: string;
};

type ReportNoticeAction =
  | "mark_notice_sent"
  | "mark_notice_failed"
  | "waive_notice"
  | "record_contradiction"
  | "mark_contradiction_accepted"
  | "mark_contradiction_rejected"
  | "mark_contradiction_expired";

type ReportSubjectNotice = {
  id: string;
  report_id: string;
  subject_document_number: string;
  subject_email: string | null;
  notice_status: string;
  notice_channel: string;
  notice_reference: string | null;
  notice_sent_at: string | null;
  contradiction_deadline: string | null;
  contradiction_received_at: string | null;
  contradiction_status: string;
  contradiction_summary: string | null;
  created_at: string;
  updated_at: string;
};

type ReportEvidenceFile = {
  id: string;
  report_id: string | null;
  uploaded_by_user_id: string;
  evidence_type: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string | null;
  legal_declaration_accepted: boolean;
  uploaded_at: string;
  created_at: string;
};

type AdminAction = {
  id: string;
  report_id: string | null;
  rental_history_id?: string | null;
  admin_user_id: string;
  accion: string | null;
  action?: string | null;
  fecha_accion: string;
  timestamp?: string | null;
  resource_type?: "report" | "rental_history";
  resource_label?: string;
  resource_summary?: string | null;
  admin?: AdminReporterUser | null;
  report?: {
    id: string;
    tipo_problema: string;
    descripcion: string;
    estado: string;
    reportado_por: string | null;
  } | null;
  rental_history?: {
    id: string;
    cedula_inquilino: string;
    lessor_name: string | null;
    city: string | null;
    property_type: string | null;
    status: string;
  } | null;
};

type RentalHistoryStatus =
  | "pending_admin_verification"
  | "verified"
  | "rejected"
  | "disputed"
  | "draft"
  | "pending_tenant_consent"
  | "archived";

type RentalHistory = {
  id: string;
  tenant_id: string | null;
  reported_by_user_id: string | null;
  cedula_inquilino: string;
  subject_type: "natural_person" | "legal_entity" | string | null;
  subject_document_type: "CC" | "CE" | "NIT" | "PAS" | "PEP" | "PPT" | "TI" | "OTHER" | string | null;
  subject_document_number: string | null;
  source_type: "lessor_reported" | "tenant_self_declared" | "admin_imported" | string | null;
  lessor_name: string | null;
  lessor_contact: string | null;
  lessor_document: string | null;
  city: string | null;
  property_type: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_duration_months: number | null;
  monthly_rent_amount: number | null;
  currency: string;
  deposit_amount: number | null;
  had_late_payments: boolean | null;
  late_payment_months: number | null;
  had_property_damage: boolean | null;
  property_damage_notes: string | null;
  formal_handover: boolean | null;
  had_debt_at_handover: boolean | null;
  debt_amount: number | null;
  has_supporting_documents: boolean;
  tenant_consent_status: string;
  status: RentalHistoryStatus;
  verification_notes: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  dispute_status: string;
  dispute_notes: string | null;
  score_impact_enabled: boolean;
  visibility_level: string;
  created_at: string;
  updated_at: string;
};

type IdentityVerificationStatus = "unverified" | "pending_review" | "verified" | "rejected";
type ReportingEligibilityStatus = "not_allowed" | "limited" | "allowed" | "suspended";
type IdentityDocumentStatus = "pending" | "approved" | "rejected";

type IdentityVerificationDocument = {
  id: string;
  secure_document_id?: string;
  user_id: string;
  owner_user_id?: string | null;
  document_type: string;
  document_category?: string;
  status?: IdentityDocumentStatus;
  secure_document_status?: string;
  metadata?: {
    identity_verification?: Record<string, unknown>;
  };
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string | null;
  verification_status: IdentityDocumentStatus;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_notes: string | null;
  created_at: string;
  current_review?: Record<string, unknown> | null;
};

type IdentityVerificationItem = IdentityVerificationDocument & {
  secure_document_id: string;
  owner_user_id: string;
  user_email: string | null;
  user_nombre: string | null;
  document_number: string | null;
  full_legal_name: string | null;
  phone_number: string | null;
  documents?: IdentityVerificationDocument[];
  user: {
    id: string;
    email: string;
    nombre: string | null;
    identity_verification_status: IdentityVerificationStatus;
    identity_verified_at: string | null;
    identity_verification_method: string | null;
    identity_verification_notes: string | null;
    reporting_eligibility_status: ReportingEligibilityStatus;
    fecha_registro: string;
  } | null;
};

type IdentityVerificationUser = {
  id: string;
  email: string;
  nombre: string | null;
  document_type: string | null;
  document_number: string | null;
  full_legal_name: string | null;
  phone_number: string | null;
  identity_verification_status: IdentityVerificationStatus;
  identity_verified_at: string | null;
  identity_verification_method: string | null;
  identity_verification_notes: string | null;
  reporting_eligibility_status: ReportingEligibilityStatus;
  fecha_registro: string;
  documents: IdentityVerificationDocument[];
};

type LegalSignalStatus = "detected" | "under_review" | "verified" | "rejected";
type LegalSignalDisputeStatus = LegalTraceDisputeStatus;

type LegalCaseSignal = {
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
  status: LegalSignalStatus;
  verification_notes: string | null;
  verified_by_admin_id: string | null;
  verified_at: string | null;
  rejected_by_admin_id: string | null;
  rejected_at: string | null;
  dispute_status: LegalSignalDisputeStatus;
  dispute_notes: string | null;
  disputed_at: string | null;
  legal_review_status: LegalTraceReviewStatus | null;
  legal_notes: string | null;
  created_by_admin_id: string | null;
  relevance_for_rental_risk: boolean;
  score_impact_enabled: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  tenants?: {
    id: string;
    nombre: string;
    cedula: string;
    ciudad: string;
  } | null;
};

type AdminReportsResponse = {
  success: boolean;
  reports: AdminReport[];
  message?: string;
};

type AdminActionsResponse = {
  success: boolean;
  actions: AdminAction[];
  message?: string;
};

type RentalHistoriesResponse = {
  success: boolean;
  rental_histories: RentalHistory[];
  message?: string;
};

type RentalHistoryStatusResponse = {
  success: boolean;
  rental_history?: RentalHistory;
  credit_grant?: {
    granted: boolean;
    reason: "granted" | "already_granted" | "monthly_limit_reached" | "not_applicable";
  };
  message?: string;
};

type IdentityVerificationsResponse = {
  success: boolean;
  verifications?: IdentityVerificationItem[];
  users: IdentityVerificationUser[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type IdentityVerificationUpdateResponse = {
  success: boolean;
  verification?: IdentityVerificationItem;
  user?: IdentityVerificationUser;
  message?: string;
};

type LegalSignalsResponse = {
  success: boolean;
  signals: LegalCaseSignal[];
  message?: string;
};

type AdminPlanType = "free" | "basic" | "pro" | "admin";

type AdminUser = {
  id: string;
  email: string;
  tipo_usuario: string;
  plan_type: AdminPlanType;
  daily_search_limit: number | null;
  created_at: string;
};

type PlanChangeLog = {
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
  admin_user?: AdminReporterUser | null;
  target_user?: AdminReporterUser | null;
};

type PlanChangeLogsPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AdminUsersResponse = {
  success: boolean;
  users: AdminUser[];
  message?: string;
};

type PlanChangeLogsResponse = {
  success: boolean;
  logs: PlanChangeLog[];
  pagination?: PlanChangeLogsPagination;
  message?: string;
};

type AdminWompiPayment = {
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

type AdminWompiPaymentsPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AdminWompiPaymentsResponse = {
  success: boolean;
  data: AdminWompiPayment[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type DataSubjectRequestType =
  | "access"
  | "correction"
  | "deletion"
  | "authorization_revocation"
  | "claim"
  | "other";

type DataSubjectRequestStatus =
  | "received"
  | "in_review"
  | "awaiting_user_info"
  | "resolved"
  | "rejected";

type DataDisputeTargetType =
  | "report"
  | "judicial_signal"
  | "score"
  | "search_result"
  | "other";

type DataDisputeType =
  | "inaccurate"
  | "outdated"
  | "paid_or_resolved"
  | "identity_theft"
  | "unauthorized_processing"
  | "not_mine"
  | "other";

type DataDisputeStatus =
  | "received"
  | "in_review"
  | "awaiting_user_info"
  | "accepted"
  | "rejected"
  | "resolved";

type HumanReviewRequestReason =
  | "disputed_information"
  | "outdated_information"
  | "inaccurate_score"
  | "identity_theft"
  | "automated_decision_concern"
  | "other";

type HumanReviewRequestStatus =
  | "received"
  | "in_review"
  | "awaiting_user_info"
  | "resolved"
  | "rejected";

type AdminDataSubjectRequest = {
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

type AdminDataDispute = {
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

type AdminHumanReviewRequest = {
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

type AdminDataSubjectRequestsResponse = {
  success: boolean;
  requests: AdminDataSubjectRequest[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type AdminHumanReviewRequestsResponse = {
  success: boolean;
  requests: AdminHumanReviewRequest[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type AdminDataDisputesResponse = {
  success: boolean;
  disputes: AdminDataDispute[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type AdminDataSubjectRequestUpdateResponse = {
  success: boolean;
  request?: AdminDataSubjectRequest;
  message?: string;
};

type AdminHumanReviewRequestUpdateResponse = {
  success: boolean;
  request?: AdminHumanReviewRequest;
  message?: string;
};

type AdminDataDisputeUpdateResponse = {
  success: boolean;
  dispute?: AdminDataDispute;
  message?: string;
};

type DataInventoryDomain =
  | "users"
  | "reports"
  | "judicial_signals"
  | "searches"
  | "payments"
  | "scoring"
  | "admin_audit"
  | "legal_requests";

type DataInventoryCategory =
  | "identification"
  | "contact"
  | "financial"
  | "behavioral"
  | "judicial"
  | "transactional"
  | "technical"
  | "legal"
  | "derived_score";

type DataInventorySensitivity = "low" | "medium" | "high" | "sensitive";

type DataInventorySourceType =
  | "user_provided"
  | "admin_provided"
  | "public_registry"
  | "third_party_report"
  | "system_generated"
  | "payment_provider";

type DataInventoryLegalBasis =
  | "consent"
  | "contract"
  | "legal_obligation"
  | "public_source"
  | "legitimate_interest";

type DataInventoryItem = {
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

type DataInventoryFormState = {
  data_domain: DataInventoryDomain;
  field_name: string;
  description: string;
  data_category: DataInventoryCategory;
  sensitivity_level: DataInventorySensitivity;
  source_type: DataInventorySourceType;
  legal_basis: DataInventoryLegalBasis;
  purpose: string;
  retention_policy: string;
  retention_days: string;
  impacts_scoring: boolean;
  requires_consent: boolean;
  is_public_source: boolean;
  is_active: boolean;
};

type DataInventoryFilters = {
  data_domain: string;
  data_category: string;
  sensitivity_level: string;
  legal_basis: string;
  impacts_scoring: string;
  is_active: string;
};

type DataInventoryResponse = {
  success: boolean;
  items: DataInventoryItem[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type DataInventoryMutationResponse = {
  success: boolean;
  item?: DataInventoryItem;
  message?: string;
};

type AdminAuditSeverity = "low" | "medium" | "high" | "critical";

type AdminAuditLog = {
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

type AdminAuditFilters = {
  severity: string;
  action_type: string;
  admin_email: string;
  target_type: string;
};

type AdminAuditLogsResponse = {
  success: boolean;
  logs: AdminAuditLog[];
  pagination: AdminWompiPaymentsPagination;
  message?: string;
};

type AdminWompiVerifyResult = {
  payment_id: string;
  reference: string;
  internal_status: string;
  wompi_transaction_id: string;
  wompi_status_current: string;
  amount_in_cents?: number;
  currency?: string;
  finalized_at: string | null;
  consistency_checks: {
    transaction_id_matches: boolean;
    reference_matches: boolean;
    amount_matches: boolean;
    currency_matches: boolean;
  };
};

type AdminWompiVerifyResponse = {
  success: boolean;
  data?: AdminWompiVerifyResult;
  message?: string;
};

type AdminWompiReconcileResult = {
  reconciled: boolean;
  already_processed?: boolean;
  payment_id: string;
  user_id?: string | null;
  plan_type?: string;
  daily_search_limit?: number | null;
  wompi_status?: string;
  audit_logged?: boolean;
  consistency_checks?: {
    transaction_id_matches: boolean;
    reference_matches: boolean;
    status_approved: boolean;
    amount_matches: boolean;
    currency_matches: boolean;
  };
  failed_checks?: string[];
};

type AdminWompiReconcileResponse = {
  success: boolean;
  data?: AdminWompiReconcileResult;
  message?: string;
};

type WompiVerifyState =
  | { status: "success"; data: AdminWompiVerifyResult }
  | { status: "error"; message: string };

type WompiReconcileState =
  | { status: "success"; data: AdminWompiReconcileResult }
  | { status: "error"; message: string; data?: AdminWompiReconcileResult };

type WompiPaymentFilters = {
  status: string;
  plan_type: string;
  reference: string;
  user_email: string;
};

type UpdateUserPlanResponse = {
  success: boolean;
  message?: string;
  user?: AdminUser;
};

type AdminMetrics = {
  searches_today: number;
  searches_7d: number;
  unique_search_users_7d: number;
  upgrade_clicks_7d: number;
  basic_clicks_7d: number;
  pro_clicks_7d: number;
  enterprise_clicks_7d: number;
  payments_created_7d: number;
  payments_pending_7d: number;
  payments_approved_7d: number;
  payments_failed_7d: number;
  users_free: number;
  users_basic: number;
  users_pro: number;
  users_admin: number;
  identity_verifications_pending: number;
  conversion_search_to_upgrade_7d: number;
  conversion_upgrade_to_plan_click_7d: number;
  payment_approval_rate_7d: number;
};

type AdminMetricsResponse = {
  success: boolean;
  metrics: AdminMetrics;
  message?: string;
};

type UpdateReportResponse = {
  success: boolean;
  message?: string;
  report?: AdminReport;
};

type UpdateLegalSignalResponse = {
  success: boolean;
  message?: string;
  signal?: LegalCaseSignal;
};

type AdminMfaStatus = {
  mfa_enabled: boolean;
  mfa_last_verified_at: string | null;
  recent_mfa_valid: boolean;
  backup_codes_remaining: number;
};

type AdminMfaStatusResponse = AdminMfaStatus & {
  success: boolean;
  message?: string;
};

type AdminMfaSetupResponse = {
  success: boolean;
  otpauth_uri?: string;
  qr_payload?: string;
  message?: string;
};

type AdminMfaVerifyResponse = {
  success: boolean;
  backup_codes?: string[];
  mfa_enabled?: boolean;
  mfa_last_verified_at?: string;
  backup_codes_remaining?: number;
  message?: string;
};

type MfaRequiredResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
};

type LoadingState = "idle" | "loading" | "success" | "error";

type MetricsState =
  | { status: "idle" | "loading" }
  | { status: "success"; data: AdminMetrics }
  | { status: "forbidden" }
  | { status: "error"; message?: string };

type DecisionState = {
  reportId: string;
  action: ReportReviewAction;
  notes?: string;
  rejection_reason?: string;
} | null;

type SignalDecisionState = {
  signalId: string;
  action: "verify" | "review" | "reject" | "toggle-impact" | "toggle-dispute";
  payload: Record<string, unknown>;
} | null;

type AdminTab =
  | "summary"
  | "reports"
  | "history"
  | "rentalHistory"
  | "users"
  | "payments"
  | "disputes"
  | "dataRequests"
  | "humanReview"
  | "dataInventory"
  | "identityVerifications"
  | "security"
  | "audit"
  | "signals";

const ADMIN_TAB_KEYS: AdminTab[] = [
  "summary",
  "reports",
  "history",
  "rentalHistory",
  "users",
  "payments",
  "disputes",
  "dataRequests",
  "humanReview",
  "dataInventory",
  "identityVerifications",
  "security",
  "audit",
  "signals",
];

function isAdminTab(value: string | null): value is AdminTab {
  return !!value && ADMIN_TAB_KEYS.includes(value as AdminTab);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const ITEMS_PER_PAGE = 20;
const WOMPI_PAYMENTS_PAGE_SIZE = 25;
const PLAN_CHANGE_LOGS_PAGE_SIZE = 50;
const AUDIT_LOGS_PAGE_SIZE = 25;
const PLAN_OPTIONS: AdminPlanType[] = ["free", "basic", "pro", "admin"];
const IDENTITY_STATUS_LABELS: Record<IdentityVerificationStatus, string> = {
  unverified: "Sin verificar",
  pending_review: "Pendiente revisión",
  verified: "Verificada",
  rejected: "Rechazada",
};
const IDENTITY_DOCUMENT_STATUS_LABELS: Record<IdentityDocumentStatus, string> = {
  pending: "Documento pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
};
const IDENTITY_DOCUMENT_STATUS_STYLES: Record<IdentityDocumentStatus, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-green-50 text-green-800 border-green-200",
  rejected: "bg-red-50 text-red-800 border-red-200",
};
const REPORTING_ELIGIBILITY_LABELS: Record<ReportingEligibilityStatus, string> = {
  not_allowed: "No habilitado",
  limited: "Limitado",
  allowed: "Habilitado",
  suspended: "Suspendido",
};
const AUDIT_SEVERITY_LABELS: Record<AdminAuditSeverity, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Critica",
};
const WOMPI_PAYMENT_STATUSES = [
  "created",
  "pending",
  "approved",
  "approved_pending_email_verification",
  "declined",
  "failed",
  "error",
  "voided",
] as const;

const EMPTY_WOMPI_PAYMENT_FILTERS: WompiPaymentFilters = {
  status: "",
  plan_type: "",
  reference: "",
  user_email: "",
};

const EMPTY_PLAN_CHANGE_LOG_FILTERS = {
  user_email: "",
  reason: "",
  previous_plan: "",
  new_plan: "",
};

const DATA_REQUEST_TYPES: DataSubjectRequestType[] = [
  "access",
  "correction",
  "deletion",
  "authorization_revocation",
  "claim",
  "other",
];

const DATA_REQUEST_STATUSES: DataSubjectRequestStatus[] = [
  "received",
  "in_review",
  "awaiting_user_info",
  "resolved",
  "rejected",
];

const DATA_DISPUTE_TARGET_TYPES: DataDisputeTargetType[] = [
  "report",
  "judicial_signal",
  "score",
  "search_result",
  "other",
];

const DATA_DISPUTE_TYPES: DataDisputeType[] = [
  "inaccurate",
  "outdated",
  "paid_or_resolved",
  "identity_theft",
  "unauthorized_processing",
  "not_mine",
  "other",
];

const DATA_DISPUTE_STATUSES: DataDisputeStatus[] = [
  "received",
  "in_review",
  "awaiting_user_info",
  "accepted",
  "rejected",
  "resolved",
];

const HUMAN_REVIEW_REQUEST_REASONS: HumanReviewRequestReason[] = [
  "disputed_information",
  "outdated_information",
  "inaccurate_score",
  "identity_theft",
  "automated_decision_concern",
  "other",
];

const HUMAN_REVIEW_REQUEST_STATUSES: HumanReviewRequestStatus[] = [
  "received",
  "in_review",
  "awaiting_user_info",
  "resolved",
  "rejected",
];

const EMPTY_DATA_REQUEST_FILTERS = {
  status: "",
  request_type: "",
  requester_email: "",
};

const EMPTY_HUMAN_REVIEW_FILTERS = {
  status: "",
  reason: "",
  requester_email: "",
  requester_document_id: "",
};

const EMPTY_DATA_DISPUTE_FILTERS = {
  status: "",
  target_type: "",
  dispute_type: "",
  requester_email: "",
  requester_document_id: "",
};

const DATA_INVENTORY_DOMAINS: DataInventoryDomain[] = [
  "users",
  "reports",
  "judicial_signals",
  "searches",
  "payments",
  "scoring",
  "admin_audit",
  "legal_requests",
];

const DATA_INVENTORY_CATEGORIES: DataInventoryCategory[] = [
  "identification",
  "contact",
  "financial",
  "behavioral",
  "judicial",
  "transactional",
  "technical",
  "legal",
  "derived_score",
];

const DATA_INVENTORY_SENSITIVITY_LEVELS: DataInventorySensitivity[] = [
  "low",
  "medium",
  "high",
  "sensitive",
];

const DATA_INVENTORY_SOURCE_TYPES: DataInventorySourceType[] = [
  "user_provided",
  "admin_provided",
  "public_registry",
  "third_party_report",
  "system_generated",
  "payment_provider",
];

const DATA_INVENTORY_LEGAL_BASES: DataInventoryLegalBasis[] = [
  "consent",
  "contract",
  "legal_obligation",
  "public_source",
  "legitimate_interest",
];

const LEGAL_TRACE_SOURCE_TYPES: LegalTraceSourceType[] = [
  "user_provided",
  "admin_provided",
  "public_registry",
  "judicial_public_source",
  "third_party_report",
  "system_generated",
];

const LEGAL_TRACE_LEGAL_BASES: LegalTraceLegalBasis[] = [
  "consent",
  "public_source",
  "legitimate_interest",
  "contract",
  "legal_obligation",
];

const LEGAL_TRACE_DISPUTE_STATUSES: LegalTraceDisputeStatus[] = [
  "none",
  "disputed",
  "resolved",
  "rejected",
];

const LEGAL_TRACE_REVIEW_STATUSES: LegalTraceReviewStatus[] = [
  "pending",
  "reviewed",
  "approved",
  "rejected",
  "needs_more_info",
];

const EMPTY_DATA_INVENTORY_FILTERS: DataInventoryFilters = {
  data_domain: "",
  data_category: "",
  sensitivity_level: "",
  legal_basis: "",
  impacts_scoring: "",
  is_active: "true",
};

const EMPTY_AUDIT_FILTERS: AdminAuditFilters = {
  severity: "",
  action_type: "",
  admin_email: "",
  target_type: "",
};

const EMPTY_DATA_INVENTORY_FORM: DataInventoryFormState = {
  data_domain: "users",
  field_name: "",
  description: "",
  data_category: "identification",
  sensitivity_level: "medium",
  source_type: "user_provided",
  legal_basis: "consent",
  purpose: "",
  retention_policy: "",
  retention_days: "",
  impacts_scoring: false,
  requires_consent: true,
  is_public_source: false,
  is_active: true,
};

const PROBLEM_LABELS: Record<string, string> = {
  impago: "Mora / Impago",
  danos: "Daños al inmueble",
  desalojo: "Desalojo",
  ruido: "Ruido",
  otros: "Otros",
};

const STATUS_STYLES = {
  pendiente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  aprobado: "bg-green-100 text-green-800 border-green-200",
  rechazado: "bg-red-100 text-red-800 border-red-200",
} as const;

const ACTION_STYLES = {
  aprobado: "bg-green-100 text-green-800 border-green-200",
  rechazado: "bg-red-100 text-red-800 border-red-200",
} as const;

const SIGNAL_STATUS_STYLES: Record<LegalSignalStatus, string> = {
  detected: "bg-blue-100 text-blue-800 border-blue-200",
  under_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  verified: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

const DISPUTE_STATUS_STYLES: Record<LegalSignalDisputeStatus, string> = {
  none: "bg-gray-100 text-gray-700 border-gray-200",
  disputed: "bg-orange-100 text-orange-800 border-orange-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

const WOMPI_PAYMENT_STATUS_STYLES: Record<string, string> = {
  approved: "bg-green-100 text-green-800 border-green-200",
  approved_pending_email_verification: "bg-amber-100 text-amber-900 border-amber-300",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  created: "bg-amber-100 text-amber-800 border-amber-200",
  declined: "bg-red-100 text-red-800 border-red-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  error: "bg-red-100 text-red-800 border-red-200",
  voided: "bg-red-100 text-red-800 border-red-200",
  unknown: "bg-gray-100 text-gray-700 border-gray-200",
};

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function formatProblemLabel(tipo: string): string {
  return PROBLEM_LABELS[tipo] || tipo || "Sin tipo";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No disponible";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Fecha inválida";
  return parsed.toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function truncateText(value: string, max = 120): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function formatIdentityMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "Sin metadata";

  const entries = Object.entries(metadata)
    .filter(([key, value]) =>
      !["review_status", "reviewed_at", "reviewed_by", "review_notes"].includes(key) &&
      value !== null &&
      value !== undefined &&
      typeof value !== "object"
    )
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.length > 0 ? entries.join(" · ") : "Sin metadata";
}

function formatMetricNumber(value: number): string {
  return value.toLocaleString("es-CO");
}

function formatMetricPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatCOP(amountInCents: number, currency: string): string {
  const amount = Number.isFinite(amountInCents) ? amountInCents / 100 : 0;

  return amount.toLocaleString("es-CO", {
    style: "currency",
    currency: currency || "COP",
    maximumFractionDigits: 0,
  });
}

function formatNullableCOP(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "No disponible";

  return Number(amount).toLocaleString("es-CO", {
    style: "currency",
    currency: currency || "COP",
    maximumFractionDigits: 0,
  });
}

function formatBooleanValue(value: boolean | null | undefined): string {
  if (value === true) return "Si";
  if (value === false) return "No";
  return "N/D";
}

function formatFailedChecks(failedChecks: string[] | undefined): string {
  if (!failedChecks || failedChecks.length === 0) return "No disponible";

  const labels: Record<string, string> = {
    transaction_id_matches: "transaction_id no coincide",
    reference_matches: "reference no coincide",
    status_approved: "Wompi no devolvio APPROVED",
    amount_matches: "valor no coincide",
    currency_matches: "moneda no coincide",
  };

  return failedChecks.map((check) => labels[check] || check).join(", ");
}

function formatRentalHistoryStatus(status: RentalHistoryStatus): string {
  const labels: Record<RentalHistoryStatus, string> = {
    pending_admin_verification: "Pendiente",
    verified: "Verificado",
    rejected: "Rechazado",
    disputed: "Disputado",
    draft: "Borrador",
    pending_tenant_consent: "Consentimiento",
    archived: "Archivado",
  };

  return labels[status] || status;
}

function formatRentalHistorySubjectType(value: RentalHistory["subject_type"]): string {
  if (value === "natural_person") return "Persona natural";
  if (value === "legal_entity") return "Empresa";
  return "No disponible";
}

function formatRentalHistorySourceType(value: RentalHistory["source_type"]): string {
  if (value === "lessor_reported") return "Aportado por arrendador";
  if (value === "tenant_self_declared") return "Autodeclarado por inquilino";
  if (value === "admin_imported") return "Carga administrativa";
  return "No disponible";
}

function formatSignalStatus(status: LegalSignalStatus): string {
  const labels: Record<LegalSignalStatus, string> = {
    detected: "Detectada",
    under_review: "En revisión",
    verified: "Verificada",
    rejected: "Rechazada",
  };
  return labels[status] || status;
}

function formatDisputeStatus(status: LegalSignalDisputeStatus): string {
  const labels: Record<LegalSignalDisputeStatus, string> = {
    none: "Sin disputa",
    disputed: "Disputada",
    resolved: "Resuelta",
    rejected: "Rechazada",
  };
  return labels[status] || status;
}

function getPlanLimit(planType: AdminPlanType): number | null {
  const limits: Record<AdminPlanType, number | null> = {
    free: 3,
    basic: 8,
    pro: 30,
    admin: null,
  };

  return limits[planType];
}

function formatLimit(value: number | null | undefined): string {
  return value === null || value === undefined ? "Sin limite" : String(value);
}

function formatPlanChangeReason(reason: string | null): string {
  const labels: Record<string, string> = {
    manual_admin_update: "Cambio manual admin",
    wompi_webhook_auto_activation: "Webhook Wompi APPROVED",
    wompi_admin_manual_reconcile: "Reconciliación manual Wompi",
  };

  return reason ? labels[reason] || reason : "N/D";
}

function formatAuditSeverity(severity: AdminAuditSeverity | string): string {
  return AUDIT_SEVERITY_LABELS[severity as AdminAuditSeverity] || severity || "N/D";
}

function getAuditSeverityClass(severity: AdminAuditSeverity): string {
  const styles: Record<AdminAuditSeverity, string> = {
    low: "border-gray-200 bg-gray-50 text-gray-700",
    medium: "border-blue-200 bg-blue-50 text-blue-800",
    high: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-red-200 bg-red-50 text-red-800",
  };

  return styles[severity] || styles.medium;
}

function summarizeAuditState(state: Record<string, unknown> | null): string {
  if (!state) return "Sin resumen";

  const entries = Object.entries(state)
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 6)
    .map(([key, value]) => {
      if (typeof value === "object") return `${key}: {...}`;
      return `${key}: ${String(value)}`;
    });

  return entries.length > 0 ? entries.join(" / ") : "Sin resumen";
}

function formatDataRequestType(type: DataSubjectRequestType): string {
  const labels: Record<DataSubjectRequestType, string> = {
    access: "Acceso",
    correction: "Corrección",
    deletion: "Eliminación",
    authorization_revocation: "Revocatoria autorización",
    claim: "Reclamo",
    other: "Otra",
  };

  return labels[type] || type;
}

function formatDataRequestStatus(status: DataSubjectRequestStatus): string {
  const labels: Record<DataSubjectRequestStatus, string> = {
    received: "Recibida",
    in_review: "En revisión",
    awaiting_user_info: "Pendiente usuario",
    resolved: "Resuelta",
    rejected: "Rechazada",
  };

  return labels[status] || status;
}

function formatDataDisputeTargetType(type: DataDisputeTargetType): string {
  const labels: Record<DataDisputeTargetType, string> = {
    report: "Reporte",
    judicial_signal: "Senal judicial",
    score: "Score",
    search_result: "Resultado busqueda",
    other: "Otro",
  };

  return labels[type] || type;
}

function formatDataDisputeType(type: DataDisputeType): string {
  const labels: Record<DataDisputeType, string> = {
    inaccurate: "Inexacto",
    outdated: "Desactualizado",
    paid_or_resolved: "Pagado/resuelto",
    identity_theft: "Suplantacion",
    unauthorized_processing: "No autorizado",
    not_mine: "No corresponde",
    other: "Otra",
  };

  return labels[type] || type;
}

function formatDataDisputeStatus(status: DataDisputeStatus): string {
  const labels: Record<DataDisputeStatus, string> = {
    received: "Recibida",
    in_review: "En revision",
    awaiting_user_info: "Pendiente usuario",
    accepted: "Aceptada",
    rejected: "Rechazada",
    resolved: "Resuelta",
  };

  return labels[status] || status;
}

function formatHumanReviewReason(reason: HumanReviewRequestReason): string {
  const labels: Record<HumanReviewRequestReason, string> = {
    disputed_information: "Informacion en disputa",
    outdated_information: "Informacion desactualizada",
    inaccurate_score: "Score inexacto",
    identity_theft: "Suplantacion",
    automated_decision_concern: "Decision automatizada",
    other: "Otro",
  };

  return labels[reason] || reason;
}

function formatHumanReviewStatus(status: HumanReviewRequestStatus): string {
  const labels: Record<HumanReviewRequestStatus, string> = {
    received: "Recibida",
    in_review: "En revision",
    awaiting_user_info: "Pendiente usuario",
    resolved: "Resuelta",
    rejected: "Rechazada",
  };

  return labels[status] || status;
}

function formatInventoryBoolean(value: boolean): string {
  return value ? "Si" : "No";
}

function formatInventoryRetention(item: DataInventoryItem): string {
  if (item.retention_days === null || item.retention_days === undefined) {
    return item.retention_policy;
  }

  return `${item.retention_policy} (${item.retention_days} dias)`;
}

function toDataInventoryPayload(form: DataInventoryFormState) {
  return {
    data_domain: form.data_domain,
    field_name: form.field_name.trim(),
    description: form.description.trim(),
    data_category: form.data_category,
    sensitivity_level: form.sensitivity_level,
    source_type: form.source_type,
    legal_basis: form.legal_basis,
    purpose: form.purpose.trim(),
    retention_policy: form.retention_policy.trim(),
    retention_days: form.retention_days.trim() ? Number(form.retention_days) : null,
    impacts_scoring: form.impacts_scoring,
    requires_consent: form.requires_consent,
    is_public_source: form.is_public_source,
    is_active: form.is_active,
  };
}

function promptNullableTraceValue(label: string, current: string | null | undefined) {
  const value = window.prompt(label, current || "");
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function promptTraceEnum<T extends string>(
  label: string,
  current: T | null | undefined,
  options: readonly T[]
) {
  const value = window.prompt(`${label}\nOpciones: ${options.join(", ")}`, current || "");
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return options.includes(trimmed as T) ? (trimmed as T) : undefined;
}

function promptTraceBoolean(label: string, current: boolean | null | undefined) {
  const value = window.prompt(label, current ? "si" : "no");
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["si", "sí", "s", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return undefined;
}

function collectLegalTracePayload(item: LegalTraceView): LegalTracePayload | null {
  const sourceType = promptTraceEnum("Tipo de fuente", item.source_type, LEGAL_TRACE_SOURCE_TYPES);
  if (sourceType === undefined) return null;

  const legalBasis = promptTraceEnum("Base legal", item.legal_basis, LEGAL_TRACE_LEGAL_BASES);
  if (legalBasis === undefined) return null;

  const disputeStatus = promptTraceEnum(
    "Estado de disputa",
    item.dispute_status,
    LEGAL_TRACE_DISPUTE_STATUSES
  );
  if (disputeStatus === undefined) return null;

  const legalReviewStatus = promptTraceEnum(
    "Estado de revisión legal",
    item.legal_review_status,
    LEGAL_TRACE_REVIEW_STATUSES
  );
  if (legalReviewStatus === undefined) return null;

  const publicSourceFlag = promptTraceBoolean("Fuente pública? si/no", item.public_source_flag);
  if (publicSourceFlag === undefined) return null;

  const impactsScoring = promptTraceBoolean("Impacta score? si/no", item.impacts_scoring);
  if (impactsScoring === undefined) return null;

  const dataOrigin = promptNullableTraceValue("Origen del dato", item.data_origin);
  if (dataOrigin === undefined) return null;

  const sourceName = promptNullableTraceValue("Nombre de la fuente", item.source_name);
  if (sourceName === undefined) return null;

  const sourceReference = promptNullableTraceValue("Referencia de la fuente", item.source_reference);
  if (sourceReference === undefined) return null;

  const sourceUrl = promptNullableTraceValue("URL de la fuente", item.source_url);
  if (sourceUrl === undefined) return null;

  const legalNotes = promptNullableTraceValue("Notas legales", item.legal_notes);
  if (legalNotes === undefined) return null;

  return {
    source_type: sourceType,
    legal_basis: legalBasis,
    dispute_status: disputeStatus,
    legal_review_status: legalReviewStatus,
    public_source_flag: publicSourceFlag,
    impacts_scoring: impactsScoring,
    data_origin: dataOrigin,
    source_name: sourceName,
    source_reference: sourceReference,
    source_url: sourceUrl,
    legal_notes: legalNotes,
  };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-gray-900">
        {value.toLocaleString("es-CO")}
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  const isPercentage = value.endsWith("%");

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="truncate text-xs font-medium text-gray-500">{label}</p>
      <p
        className={classNames(
          "mt-1 line-clamp-2 overflow-hidden break-words font-bold text-gray-900",
          isPercentage ? "text-lg font-semibold" : "text-xl"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pendiente" | "aprobado" | "rechazado";
}) {
  const tone: StatusTone =
    status === "aprobado" ? "success" : status === "rechazado" ? "error" : "pending";

  return <SystemStatusBadge tone={tone}>{status.toUpperCase()}</SystemStatusBadge>;
}

function formatAdminActionLabel(action: string | null | undefined): string {
  const labels: Record<string, string> = {
    aprobado: "Reporte aprobado",
    rechazado: "Reporte rechazado",
    report_approved: "Reporte aprobado",
    report_rejected: "Reporte rechazado",
    approve: "Reporte aprobado",
    reject: "Reporte rechazado",
    mark_in_review: "En revisión",
    request_more_info: "Más información",
    block_scoring: "Scoring bloqueado",
    rental_history_verified: "Historial verificado",
    rental_history_rejected: "Historial rechazado",
  };

  return labels[action || ""] || (action || "accion").replace(/_/g, " ");
}

function ActionBadge({ action }: { action: string | null | undefined }) {
  const normalized = action || "";
  const tone: StatusTone =
    normalized.includes("approved") ||
    normalized.includes("verified") ||
    normalized === "approve" ||
    normalized === "aprobado"
      ? "success"
      : normalized.includes("rejected") || normalized === "reject" || normalized === "rechazado"
        ? "error"
        : normalized === "mark_in_review" || normalized === "request_more_info"
          ? "review"
          : "neutral";

  return (
    <SystemStatusBadge tone={tone}>
      {formatAdminActionLabel(action)}
    </SystemStatusBadge>
  );
}

function SignalStatusBadge({ status }: { status: LegalSignalStatus }) {
  const tone: StatusTone =
    status === "verified" ? "success" : status === "rejected" ? "error" : status === "under_review" ? "review" : "pending";

  return <SystemStatusBadge tone={tone}>{formatSignalStatus(status)}</SystemStatusBadge>;
}

function DisputeStatusBadge({ status }: { status: LegalSignalDisputeStatus }) {
  const tone: StatusTone =
    status === "resolved" ? "success" : status === "rejected" ? "error" : status === "disputed" ? "review" : "neutral";

  return <SystemStatusBadge tone={tone}>{formatDisputeStatus(status)}</SystemStatusBadge>;
}

function WompiPaymentStatusBadge({ status }: { status: string | null }) {
  const normalized = (status || "unknown").toLowerCase();
  const label =
    normalized === "approved_pending_email_verification"
      ? "Aprobado · correo pendiente"
      : normalized;
  const tone: StatusTone =
    normalized === "approved"
      ? "success"
      : normalized === "declined" || normalized === "failed" || normalized === "error"
        ? "error"
        : normalized === "pending" ||
            normalized === "created" ||
            normalized === "approved_pending_email_verification"
          ? "pending"
          : "neutral";

  return <SystemStatusBadge tone={tone}>{label}</SystemStatusBadge>;
}

function RentalHistoryStatusBadge({ status }: { status: RentalHistoryStatus }) {
  const tone: StatusTone =
    status === "verified"
      ? "success"
      : status === "rejected"
        ? "error"
        : status === "disputed"
          ? "review"
          : status === "pending_tenant_consent"
            ? "info"
            : status === "pending_admin_verification"
              ? "pending"
              : "neutral";

  return <SystemStatusBadge tone={tone}>{formatRentalHistoryStatus(status)}</SystemStatusBadge>;
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
      <span className="font-medium">{label}:</span>&nbsp;{value}
    </span>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-gray-50 p-3">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm text-gray-800">{value || "—"}</p>
    </div>
  );
}

function LoadingSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border bg-white p-4 shadow-sm"
        >
          <div className="mb-3 h-4 w-1/4 rounded bg-gray-200" />
          <div className="mb-2 h-3 w-2/3 rounded bg-gray-200" />
          <div className="h-3 w-1/2 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function ErrorAlert({
  message,
  onRetry,
  retryLabel = "Reintentar",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      <div>
        <p className="font-semibold">Error</p>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">
        {description}
      </p>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    if (totalPages <= 5) return i + 1;
    if (currentPage <= 3) return i + 1;
    if (currentPage >= totalPages - 2) return totalPages - 4 + i;
    return currentPage - 2 + i;
  });

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded border px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ← Anterior
      </button>

      {pages[0] > 1 && <span className="px-2 text-gray-400">...</span>}

      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={classNames(
            "rounded px-3 py-1 text-sm font-medium",
            page === currentPage
              ? "bg-blue-600 text-white"
              : "border text-gray-700 hover:bg-gray-100"
          )}
        >
          {page}
        </button>
      ))}

      {pages[pages.length - 1] < totalPages && (
        <span className="px-2 text-gray-400">...</span>
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="rounded border px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Siguiente →
      </button>
    </div>
  );
}

function ReportDecisionModal({
  decision,
  processingId,
  onClose,
  onConfirm,
}: {
  decision: DecisionState;
  processingId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!decision) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [decision, onClose]);

  if (!decision) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div
            className={classNames(
              "flex h-10 w-10 items-center justify-center rounded-full",
              decision.action === "approve" ? "bg-green-100" : decision.action === "reject" ? "bg-red-100" : "bg-amber-100"
            )}
          >
            <svg
              className={classNames(
                "h-5 w-5",
                decision.action === "approve"
                  ? "text-green-600"
                  : decision.action === "reject" ? "text-red-600" : "text-amber-600"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {decision.action === "approve" ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              )}
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Confirmar revision
          </h3>
        </div>

        <p className="text-sm text-gray-600">
          ¿Estás seguro de que deseas{" "}
          <span className="font-semibold">
            {decision.action === "approve" ? "aprobar" : decision.action === "reject" ? "rechazar" : "actualizar"}
          </span>{" "}
          este reporte?
        </p>

        {decision.rejection_reason && (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800">
            <span className="font-semibold">Motivo:</span> {decision.rejection_reason}
          </p>
        )}

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Importante:</span> esta accion no recalcula el
            score. Solo los reportes aprobados quedan verificados y elegibles.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={!!processingId}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!!processingId}
            className={classNames(
              "rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50",
              decision.action === "approve"
                ? "bg-green-600 hover:bg-green-700"
                : decision.action === "reject"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {processingId ? "Procesando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SignalDecisionModal({
  decision,
  processingId,
  signal,
  onClose,
  onConfirm,
}: {
  decision: SignalDecisionState;
  processingId: string | null;
  signal: LegalCaseSignal | undefined;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!decision) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [decision, onClose]);

  if (!decision || !signal) return null;

  const actionLabels: Record<
    NonNullable<SignalDecisionState>["action"],
    { title: string; description: string }
  > = {
    verify: {
      title: "Verificar señal judicial",
      description:
        "Esta señal quedará verificada y podrá impactar el score del inquilino.",
    },
    review: {
      title: "Marcar en revisión",
      description:
        "La señal quedará en revisión administrativa y no impactará temporalmente el score.",
    },
    reject: {
      title: "Rechazar señal",
      description:
        "La señal será descartada y no impactará el score.",
    },
    "toggle-impact": {
      title: signal.score_impact_enabled
        ? "Desactivar impacto en score"
        : "Activar impacto en score",
      description: signal.score_impact_enabled
        ? "La señal seguirá visible, pero no afectará el cálculo."
        : "La señal comenzará a afectar el cálculo del score.",
    },
    "toggle-dispute": {
      title:
        signal.dispute_status === "disputed"
          ? "Resolver disputa"
          : "Marcar disputa",
      description:
        signal.dispute_status === "disputed"
          ? "Se cerrará la disputa de esta señal."
          : "Se marcará esta señal como disputada.",
    },
  };

  const config = actionLabels[decision.action];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>

        <div className="mt-4 rounded-lg border bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase text-gray-500">
            Inquilino
          </p>
          <p className="font-semibold text-gray-900">
            {signal.tenants?.nombre || "Sin nombre"}
          </p>
          <p className="text-sm text-gray-600">
            CC {signal.tenants?.cedula || "N/D"}
          </p>
        </div>

        <p className="mt-4 text-sm text-gray-600">{config.description}</p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={!!processingId}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!!processingId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processingId ? "Procesando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: "green" | "yellow" | "red" | "blue" | "gray";
  icon: string;
  label: string;
}) {
  const variantStyles = {
    green: "bg-green-600 hover:bg-green-700",
    yellow: "bg-yellow-600 hover:bg-yellow-700",
    red: "bg-red-600 hover:bg-red-700",
    blue: "bg-blue-600 hover:bg-blue-700",
    gray: "bg-gray-700 hover:bg-gray-800",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[variant]
      )}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function LegalTracePanel({
  item,
  disabled,
  onEdit,
}: {
  item: LegalTraceView;
  disabled?: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Trazabilidad legal
        </p>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="rounded-md border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Editar
        </button>
      </div>
      <div className="grid gap-2 text-xs text-blue-950 sm:grid-cols-2 lg:grid-cols-3">
        <p><span className="font-medium">Origen:</span> {item.data_origin || "N/D"}</p>
        <p><span className="font-medium">Fuente:</span> {item.source_name || item.source_type || "N/D"}</p>
        <p><span className="font-medium">Referencia:</span> {item.source_reference || "N/D"}</p>
        <p><span className="font-medium">Base legal:</span> {item.legal_basis || "N/D"}</p>
        <p><span className="font-medium">Fuente pública:</span> {formatBooleanValue(item.public_source_flag)}</p>
        <p><span className="font-medium">Impacta score:</span> {formatBooleanValue(item.impacts_scoring)}</p>
        <p><span className="font-medium">Disputa:</span> {item.dispute_status || "N/D"}</p>
        <p><span className="font-medium">Revisión:</span> {item.legal_review_status || "N/D"}</p>
        <p className="sm:col-span-2 lg:col-span-3">
          <span className="font-medium">Notas:</span> {item.legal_notes || "Sin notas"}
        </p>
      </div>
    </div>
  );
}

function ReportCard({
  report,
  processingId,
  onMarkInReview,
  onRequestMoreInfo,
  onApprove,
  onReject,
  onBlockScoring,
  onNoticeAction,
  onEditLegalTrace,
}: {
  report: AdminReport;
  processingId: string | null;
  onMarkInReview: () => void;
  onRequestMoreInfo: () => void;
  onApprove: () => void;
  onReject: () => void;
  onBlockScoring: () => void;
  onNoticeAction: (action: ReportNoticeAction) => void;
  onEditLegalTrace: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.estado} />
            <InlineMeta
              label="Tipo"
              value={formatProblemLabel(report.tipo_problema)}
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Arrendatario reportado
            </p>
            <h3 className="mt-1 truncate text-lg font-semibold text-gray-900">
              {report.tenants?.nombre || "Sin nombre"}
            </h3>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="truncate">CC: {report.tenants?.cedula || "N/D"}</span>
              <span className="truncate">Ciudad: {report.tenants?.ciudad || "N/D"}</span>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <InfoBox label="ID del reporte" value={report.id} />
            <InfoBox
              label="ID del reportante"
              value={report.reportado_por || "No disponible"}
            />
          </div>

          <div className="overflow-hidden rounded-lg border bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              Usuario reportante
            </p>
            {report.users ? (
              <div className="grid gap-1 text-sm text-gray-800">
                <p className="truncate">
                  <span className="font-medium">Nombre:</span>{" "}
                  {report.users.nombre || "N/D"}
                </p>
                <p className="truncate">
                  <span className="font-medium">Email:</span>{" "}
                  {report.users.email || "N/D"}
                </p>
                <p className="truncate">
                  <span className="font-medium">Tipo:</span>{" "}
                  {report.users.tipo_usuario || "N/D"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Información del reportante no disponible
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Descripción</p>
            <p className="mt-1 line-clamp-2 overflow-hidden whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {report.descripcion}
            </p>
          </div>

          <LegalTracePanel
            item={report}
            disabled={processingId === report.id}
            onEdit={onEditLegalTrace}
          />

          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                Evidencia: {report.evidence_status || "pending"}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                Revisión: {report.report_verification_status || "pending_verification"}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                Score: {report.scoring_eligibility_status || "not_eligible"}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                Notificacion: {report.subject_notice_status || "pending"}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                Contradiccion: {report.contradiction_status || "none"}
              </span>
              <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                Declaración: {formatBooleanValue(report.legal_declaration_accepted)}
              </span>
            </div>
            <p className="mb-2 text-xs leading-5 text-emerald-900">
              Deadline contradiccion: {report.contradiction_deadline ? formatDate(report.contradiction_deadline) : "N/D"}
            </p>
            {report.rejection_reason && (
              <p className="mb-2 text-xs leading-5 text-red-800">
                Motivo rechazo: {truncateText(report.rejection_reason, 220)}
              </p>
            )}
            {report.legal_review_notes && (
              <p className="mb-2 text-xs leading-5 text-emerald-900">
                Notas revision: {truncateText(report.legal_review_notes, 220)}
              </p>
            )}
            {report.legal_declaration_text && (
              <p className="mb-2 text-xs leading-5 text-emerald-900">
                {truncateText(report.legal_declaration_text, 260)}
              </p>
            )}
            {(report.evidence_files?.length || 0) > 0 ? (
              <div className="space-y-2">
                {report.evidence_files?.map((evidence) => (
                  <div key={evidence.id} className="rounded-lg border border-emerald-100 bg-white p-2 text-xs text-emerald-950">
                    <p className="font-semibold">{evidence.evidence_type} · {evidence.file_name}</p>
                    <p className="mt-1 break-all font-mono text-emerald-800">{evidence.storage_path}</p>
                    <p className="mt-1 text-emerald-700">
                      {evidence.mime_type} · {evidence.file_size} bytes · {formatDate(evidence.uploaded_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-800">Sin evidencias asociadas.</p>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Reportado el {formatDate(report.fecha_reporte)}
          </p>

          {(report.subject_notices?.length || 0) > 0 && (
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Historial notificacion/contradiccion
              </p>
              <div className="space-y-2">
                {report.subject_notices?.slice(0, 3).map((notice) => (
                  <div key={notice.id} className="text-xs text-gray-700">
                    <p className="font-medium">
                      Aviso {notice.notice_status} via {notice.notice_channel} / Contradiccion {notice.contradiction_status}
                    </p>
                    <p className="text-gray-500">
                      {formatDate(notice.created_at)}
                      {notice.contradiction_deadline ? ` · vence ${formatDate(notice.contradiction_deadline)}` : ""}
                    </p>
                    {notice.contradiction_summary && (
                      <p className="mt-1">{truncateText(notice.contradiction_summary, 180)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(report.report_review_logs?.length || 0) > 0 && (
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Historial de revision
              </p>
              <div className="space-y-2">
                {report.report_review_logs?.slice(0, 3).map((log) => (
                  <div key={log.id} className="text-xs text-gray-700">
                    <p className="font-medium">
                      {log.previous_status || "N/D"} -&gt; {log.new_status} /{" "}
                      {log.previous_scoring_eligibility_status || "N/D"} -&gt;{" "}
                      {log.new_scoring_eligibility_status}
                    </p>
                    <p className="text-gray-500">{formatDate(log.created_at)}</p>
                    {log.notes && <p className="mt-1">{truncateText(log.notes, 180)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-full shrink-0 xl:w-[240px]">
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="mb-3 text-sm font-medium text-gray-900">
              Acción administrativa
            </p>
            <div className="mt-3 flex gap-2 xl:flex-col">
              <button
                onClick={onMarkInReview}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                En revision
              </button>
              <button
                onClick={onRequestMoreInfo}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Solicitar mas info
              </button>
              <button
                onClick={onApprove}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {processingId === report.id ? "Procesando..." : "Aprobar reporte"}
              </button>

              <button
                onClick={onReject}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                {processingId === report.id ? "Procesando..." : "Rechazar reporte"}
              </button>
              <button
                onClick={onBlockScoring}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bloquear scoring
              </button>
              <button
                onClick={() => onNoticeAction("mark_notice_sent")}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Marcar notificado
              </button>
              <button
                onClick={() => onNoticeAction("record_contradiction")}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Registrar contradiccion
              </button>
              <button
                onClick={() => onNoticeAction("mark_contradiction_accepted")}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Aceptar contradiccion
              </button>
              <button
                onClick={() => onNoticeAction("mark_contradiction_rejected")}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Rechazar contradiccion
              </button>
              <button
                onClick={() => onNoticeAction("waive_notice")}
                disabled={processingId === report.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Eximir notificacion
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SignalCard({
  signal,
  processingId,
  onVerify,
  onReview,
  onReject,
  onToggleImpact,
  onToggleDispute,
  onEditLegalTrace,
}: {
  signal: LegalCaseSignal;
  processingId: string | null;
  onVerify: () => void;
  onReview: () => void;
  onReject: () => void;
  onToggleImpact: () => void;
  onToggleDispute: () => void;
  onEditLegalTrace: () => void;
}) {
  const isProcessing = processingId === signal.id;

  return (
    <article className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SignalStatusBadge status={signal.status} />
            <DisputeStatusBadge status={signal.dispute_status} />
            <InlineMeta
              label="Impacto score"
              value={signal.score_impact_enabled ? "Activo" : "Inactivo"}
            />
            <InlineMeta
              label="Relevancia"
              value={signal.relevance_for_rental_risk ? "Sí" : "No"}
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Arrendatario asociado
            </p>
            <h3 className="mt-1 truncate text-lg font-semibold text-amber-800">
              {signal.tenants?.nombre || "Sin nombre"}
            </h3>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-700">
              <span className="truncate">CC Tenant: {signal.tenants?.cedula || "N/D"}</span>
              <span className="truncate">CC Consultada: {signal.cedula_consultada || "N/D"}</span>
              <span className="truncate">Ciudad: {signal.tenants?.ciudad || "N/D"}</span>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <InfoBox label="Fuente" value={signal.source} />
            <InfoBox label="Juzgado" value={signal.court_name || "No disponible"} />
            <InfoBox
              label="Tipo de proceso"
              value={signal.process_type || "No disponible"}
            />
            <InfoBox
              label="Ciudad del proceso"
              value={signal.city || "No disponible"}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-amber-200 bg-white/70 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Asunto del proceso
            </p>
            <p className="line-clamp-2 overflow-hidden text-sm text-amber-700">
              {signal.process_subject || "No disponible"}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <InfoBox label="Fecha del proceso" value={formatDate(signal.process_date)} />
            <InfoBox label="Fecha de detección" value={formatDate(signal.detection_date)} />
          </div>

          {(signal.verification_notes || signal.dispute_notes) && (
            <div className="grid gap-3 lg:grid-cols-2">
              {signal.verification_notes && (
                <div className="overflow-hidden rounded-lg border bg-blue-50 p-3">
                  <p className="mb-1 text-xs font-medium uppercase text-blue-600">
                    Notas de verificación
                  </p>
                  <p className="line-clamp-2 overflow-hidden text-sm text-blue-900">
                    {signal.verification_notes}
                  </p>
                  {signal.verified_at && (
                    <p className="mt-1 text-xs text-blue-600">
                      {formatDate(signal.verified_at)}
                    </p>
                  )}
                </div>
              )}

              {signal.dispute_notes && (
                <div className="overflow-hidden rounded-lg border bg-orange-50 p-3">
                  <p className="mb-1 text-xs font-medium uppercase text-orange-600">
                    Notas de disputa
                  </p>
                  <p className="line-clamp-2 overflow-hidden text-sm text-orange-900">{signal.dispute_notes}</p>
                  {signal.disputed_at && (
                    <p className="mt-1 text-xs text-orange-600">
                      {formatDate(signal.disputed_at)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <LegalTracePanel
            item={{
              ...signal,
              source_name: signal.source_name || signal.source,
            }}
            disabled={isProcessing}
            onEdit={onEditLegalTrace}
          />

          <p className="text-xs text-gray-500">
            Creada: {formatDate(signal.created_at)} · Actualizada:{" "}
            {formatDate(signal.updated_at)}
          </p>
        </div>

        <div className="w-full shrink-0 xl:w-[260px]">
          <div className="rounded-lg border border-amber-200 bg-white/70 p-3">
            <p className="mb-3 text-sm font-semibold text-amber-800">
              Acción administrativa
            </p>
            <div className="flex flex-col gap-2">
              <ActionButton
                onClick={onVerify}
                disabled={isProcessing || signal.status === "verified"}
                variant="green"
                icon="✓"
                label={isProcessing ? "Procesando..." : "Verificar"}
              />
              <ActionButton
                onClick={onReview}
                disabled={isProcessing || signal.status === "under_review"}
                variant="yellow"
                icon="⏸"
                label={isProcessing ? "Procesando..." : "En revisión"}
              />
              <ActionButton
                onClick={onReject}
                disabled={isProcessing || signal.status === "rejected"}
                variant="red"
                icon="✕"
                label={isProcessing ? "Procesando..." : "Rechazar"}
              />
              <ActionButton
                onClick={onToggleImpact}
                disabled={isProcessing}
                variant="blue"
                icon="⚡"
                label={
                  isProcessing
                    ? "Procesando..."
                    : signal.score_impact_enabled
                    ? "Quitar impacto"
                    : "Activar impacto"
                }
              />
              <ActionButton
                onClick={onToggleDispute}
                disabled={isProcessing}
                variant="gray"
                icon="⚖"
                label={
                  isProcessing
                    ? "Procesando..."
                    : signal.dispute_status === "disputed"
                    ? "Resolver disputa"
                    : "Marcar disputa"
                }
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, token, isLoading, isAuthenticated, logout } = useAuth({
    requireAdmin: true,
  });

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [rentalHistories, setRentalHistories] = useState<RentalHistory[]>([]);
  const [identityVerifications, setIdentityVerifications] = useState<IdentityVerificationItem[]>([]);
  const [signals, setSignals] = useState<LegalCaseSignal[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [planChangeLogs, setPlanChangeLogs] = useState<PlanChangeLog[]>([]);
  const [planChangeLogsPagination, setPlanChangeLogsPagination] =
    useState<PlanChangeLogsPagination>({
      page: 1,
      pageSize: PLAN_CHANGE_LOGS_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });
  const [wompiPayments, setWompiPayments] = useState<AdminWompiPayment[]>([]);
  const [wompiPaymentsPagination, setWompiPaymentsPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: WOMPI_PAYMENTS_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });
  const [dataRequests, setDataRequests] = useState<AdminDataSubjectRequest[]>([]);
  const [dataRequestsPagination, setDataRequestsPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  const [humanReviewRequests, setHumanReviewRequests] = useState<AdminHumanReviewRequest[]>([]);
  const [humanReviewRequestsPagination, setHumanReviewRequestsPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  const [dataDisputes, setDataDisputes] = useState<AdminDataDispute[]>([]);
  const [dataDisputesPagination, setDataDisputesPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  const [dataInventoryItems, setDataInventoryItems] = useState<DataInventoryItem[]>([]);
  const [dataInventoryPagination, setDataInventoryPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditLogsPagination, setAuditLogsPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: AUDIT_LOGS_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });
  const [identityVerificationsPagination, setIdentityVerificationsPagination] =
    useState<AdminWompiPaymentsPagination>({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
  const [wompiVerifyResults, setWompiVerifyResults] = useState<
    Record<string, WompiVerifyState>
  >({});
  const [wompiReconcileResults, setWompiReconcileResults] = useState<
    Record<string, WompiReconcileState>
  >({});

  const [reportsLoadingState, setReportsLoadingState] =
    useState<LoadingState>("idle");
  const [actionsLoadingState, setActionsLoadingState] =
    useState<LoadingState>("idle");
  const [rentalHistoriesLoadingState, setRentalHistoriesLoadingState] =
    useState<LoadingState>("idle");
  const [identityVerificationsLoadingState, setIdentityVerificationsLoadingState] =
    useState<LoadingState>("idle");
  const [signalsLoadingState, setSignalsLoadingState] =
    useState<LoadingState>("idle");
  const [usersLoadingState, setUsersLoadingState] =
    useState<LoadingState>("idle");
  const [planLogsLoadingState, setPlanLogsLoadingState] =
    useState<LoadingState>("idle");
  const [wompiPaymentsLoadingState, setWompiPaymentsLoadingState] =
    useState<LoadingState>("idle");
  const [dataRequestsLoadingState, setDataRequestsLoadingState] =
    useState<LoadingState>("idle");
  const [humanReviewRequestsLoadingState, setHumanReviewRequestsLoadingState] =
    useState<LoadingState>("idle");
  const [dataDisputesLoadingState, setDataDisputesLoadingState] =
    useState<LoadingState>("idle");
  const [dataInventoryLoadingState, setDataInventoryLoadingState] =
    useState<LoadingState>("idle");
  const [auditLogsLoadingState, setAuditLogsLoadingState] =
    useState<LoadingState>("idle");
  const [metricsState, setMetricsState] = useState<MetricsState>({
    status: "idle",
  });

  const [reportsError, setReportsError] = useState<string | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [rentalHistoriesError, setRentalHistoriesError] = useState<string | null>(null);
  const [rentalHistoriesNotice, setRentalHistoriesNotice] = useState<string | null>(null);
  const [identityVerificationsError, setIdentityVerificationsError] = useState<string | null>(null);
  const [identityVerificationsNotice, setIdentityVerificationsNotice] = useState<string | null>(null);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [planLogsError, setPlanLogsError] = useState<string | null>(null);
  const [wompiPaymentsError, setWompiPaymentsError] = useState<string | null>(null);
  const [dataRequestsError, setDataRequestsError] = useState<string | null>(null);
  const [humanReviewRequestsError, setHumanReviewRequestsError] = useState<string | null>(null);
  const [dataDisputesError, setDataDisputesError] = useState<string | null>(null);
  const [dataInventoryError, setDataInventoryError] = useState<string | null>(null);
  const [auditLogsError, setAuditLogsError] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rentalHistoryActionId, setRentalHistoryActionId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);
  const [reconcilingPaymentId, setReconcilingPaymentId] = useState<string | null>(null);
  const [savingDataRequestId, setSavingDataRequestId] = useState<string | null>(null);
  const [savingHumanReviewRequestId, setSavingHumanReviewRequestId] = useState<string | null>(null);
  const [savingDataDisputeId, setSavingDataDisputeId] = useState<string | null>(null);
  const [savingDataInventoryId, setSavingDataInventoryId] = useState<string | null>(null);
  const [editingDataInventoryId, setEditingDataInventoryId] = useState<string | null>(null);
  const [legalTraceSavingId, setLegalTraceSavingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionState>(null);
  const [signalDecision, setSignalDecision] = useState<SignalDecisionState>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("summary");
  const [mfaStatus, setMfaStatus] = useState<AdminMfaStatus | null>(null);
  const [mfaSetupUri, setMfaSetupUri] = useState<string | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState("");
  const [mfaChallengeCode, setMfaChallengeCode] = useState("");
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [pendingIdentityAction, setPendingIdentityAction] =
    useState<PendingIdentityVerificationAction | null>(null);
  const identityActionControllerRef = useRef<IdentityVerificationActionController | null>(null);
  if (!identityActionControllerRef.current) {
    identityActionControllerRef.current = new IdentityVerificationActionController();
  }
  const initialAdminLoadTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requestedModule = new URLSearchParams(window.location.search).get("module") as AdminTab | null;
    if (isAdminTab(requestedModule)) {
      setActiveTab(requestedModule);
    }
  }, []);

  useEffect(() => {
    const handleModuleChange = (event: Event) => {
      const module = (event as CustomEvent<string>).detail;
      if (isAdminTab(module)) {
        setActiveTab(module);
      }
    };

    window.addEventListener("inmoscore-admin-module-change", handleModuleChange);
    return () => window.removeEventListener("inmoscore-admin-module-change", handleModuleChange);
  }, []);

  const [search, setSearch] = useState("");
  const [problemFilter, setProblemFilter] = useState("all");
  const [signalSearch, setSignalSearch] = useState("");
  const [signalStatusFilter, setSignalStatusFilter] = useState("all");
  const [wompiPaymentFilters, setWompiPaymentFilters] =
    useState<WompiPaymentFilters>(EMPTY_WOMPI_PAYMENT_FILTERS);
  const [wompiPaymentDraftFilters, setWompiPaymentDraftFilters] =
    useState<WompiPaymentFilters>(EMPTY_WOMPI_PAYMENT_FILTERS);
  const [dataRequestFilters, setDataRequestFilters] =
    useState(EMPTY_DATA_REQUEST_FILTERS);
  const [dataRequestDraftFilters, setDataRequestDraftFilters] =
    useState(EMPTY_DATA_REQUEST_FILTERS);
  const [humanReviewFilters, setHumanReviewFilters] =
    useState(EMPTY_HUMAN_REVIEW_FILTERS);
  const [humanReviewDraftFilters, setHumanReviewDraftFilters] =
    useState(EMPTY_HUMAN_REVIEW_FILTERS);
  const [dataDisputeFilters, setDataDisputeFilters] =
    useState(EMPTY_DATA_DISPUTE_FILTERS);
  const [dataDisputeDraftFilters, setDataDisputeDraftFilters] =
    useState(EMPTY_DATA_DISPUTE_FILTERS);
  const [dataInventoryFilters, setDataInventoryFilters] =
    useState<DataInventoryFilters>(EMPTY_DATA_INVENTORY_FILTERS);
  const [dataInventoryDraftFilters, setDataInventoryDraftFilters] =
    useState<DataInventoryFilters>(EMPTY_DATA_INVENTORY_FILTERS);
  const [auditFilters, setAuditFilters] =
    useState<AdminAuditFilters>(EMPTY_AUDIT_FILTERS);
  const [auditDraftFilters, setAuditDraftFilters] =
    useState<AdminAuditFilters>(EMPTY_AUDIT_FILTERS);
  const [dataInventoryForm, setDataInventoryForm] =
    useState<DataInventoryFormState>(EMPTY_DATA_INVENTORY_FORM);
  const [wompiPaymentsPage, setWompiPaymentsPage] = useState(1);
  const [dataRequestsPage, setDataRequestsPage] = useState(1);
  const [humanReviewRequestsPage, setHumanReviewRequestsPage] = useState(1);
  const [dataDisputesPage, setDataDisputesPage] = useState(1);
  const [dataInventoryPage, setDataInventoryPage] = useState(1);
  const [auditLogsPage, setAuditLogsPage] = useState(1);
  const [identityVerificationsPage, setIdentityVerificationsPage] = useState(1);
  const [identityVerificationFilters, setIdentityVerificationFilters] = useState({
    document_verification_status: "",
    reporting_eligibility_status: "",
    document_number: "",
    user_email: "",
  });
  const [planChangeLogFilters, setPlanChangeLogFilters] =
    useState(EMPTY_PLAN_CHANGE_LOG_FILTERS);
  const [planChangeLogDraftFilters, setPlanChangeLogDraftFilters] =
    useState(EMPTY_PLAN_CHANGE_LOG_FILTERS);
  const [planChangeLogsPage, setPlanChangeLogsPage] = useState(1);

  const adminTabs: Array<{
    key: AdminTab;
    label: string;
  }> = [
    { key: "summary", label: "Resumen" },
    { key: "reports", label: "Reportes" },
    { key: "history", label: "Historial" },
    { key: "rentalHistory", label: "Historial arrendaticio" },
    { key: "users", label: "Usuarios" },
    { key: "payments", label: "Pagos" },
    { key: "disputes", label: "Disputas" },
    { key: "dataRequests", label: "Solicitudes datos" },
    { key: "humanReview", label: "Revisión humana" },
    { key: "dataInventory", label: "Inventario datos" },
    { key: "security", label: "Seguridad" },
    { key: "audit", label: "Auditoria" },
    { key: "identityVerifications", label: "Verificación identidad" },
    { key: "signals", label: "Señales judiciales" },
  ];

  const pendingIdentityVerificationsCount =
    metricsState.status === "success"
      ? metricsState.data.identity_verifications_pending
      : identityVerifications.filter((item) => item.verification_status === "pending").length;

  const operationalCards = [
    {
      label: "Identidades pendientes",
      value: pendingIdentityVerificationsCount,
      target: "identityVerifications" as AdminTab,
      tone: "blue",
    },
    {
      label: "Reportes pendientes",
      value: reports.length,
      target: "reports" as AdminTab,
      tone: "amber",
    },
    {
      label: "Disputas abiertas",
      value: dataDisputes.filter((item) => item.status === "received" || item.status === "in_review").length,
      target: "disputes" as AdminTab,
      tone: "red",
    },
    {
      label: "Revisiones humanas",
      value: humanReviewRequests.filter(
        (item) => item.status === "received" || item.status === "in_review"
      ).length,
      target: "humanReview" as AdminTab,
      tone: "emerald",
    },
    {
      label: "Pagos pendientes",
      value: wompiPayments.filter(
        (item) =>
          item.internal_status === "pending" ||
          item.internal_status === "approved_pending_email_verification" ||
          item.wompi_status === "PENDING"
      ).length,
      target: "payments" as AdminTab,
      tone: "violet",
    },
    {
      label: "Alertas",
      value: [
        reportsError,
        rentalHistoriesError,
        identityVerificationsError,
        signalsError,
        usersError,
        wompiPaymentsError,
        dataRequestsError,
        humanReviewRequestsError,
        dataDisputesError,
        dataInventoryError,
        auditLogsError,
      ].filter(Boolean).length,
      target: "summary" as AdminTab,
      tone: "slate",
    },
    {
      label: "Auditoría reciente",
      value: auditLogs.length,
      target: "audit" as AdminTab,
      tone: "slate",
    },
  ];

  const criticalQueues: Array<{
    label: string;
    count: number;
    owner: string;
    tone: StatusTone;
    target: AdminTab;
  }> = [
    {
      label: "Verificar identidad",
      count: pendingIdentityVerificationsCount,
      owner: "Compliance",
      tone: "pending",
      target: "identityVerifications",
    },
    {
      label: "Moderar reportes",
      count: reports.length,
      owner: "Operaciones",
      tone: reports.length > 0 ? "warning" : "success",
      target: "reports",
    },
    {
      label: "Resolver disputas",
      count: dataDisputes.filter((item) => item.status === "received" || item.status === "in_review").length,
      owner: "Legal",
      tone: "review",
      target: "disputes",
    },
    {
      label: "Revisión humana",
      count: humanReviewRequests.filter((item) => item.status === "received" || item.status === "in_review").length,
      owner: "Riesgo",
      tone: "info",
      target: "humanReview",
    },
    {
      label: "Conciliar pagos",
      count: wompiPayments.filter(
        (item) =>
          item.internal_status === "pending" ||
          item.internal_status === "approved_pending_email_verification" ||
          item.wompi_status === "PENDING"
      ).length,
      owner: "Billing",
      tone: "pending",
      target: "payments",
    },
  ];

  const criticalWorkCount = criticalQueues.reduce((total, queue) => total + queue.count, 0);

  const fetchJson = useCallback(
    async (endpoint: string) => {
      if (!token) throw new Error("NO_TOKEN");
      if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL no está configurada");

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error("UNAUTHORIZED");
      }

      return response;
    },
    [token]
  );

  const loadMfaStatus = useCallback(async () => {
    try {
      const response = await fetchJson("/api/admin/mfa/status");
      const data: AdminMfaStatusResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar MFA");
      }

      setMfaStatus({
        mfa_enabled: data.mfa_enabled,
        mfa_last_verified_at: data.mfa_last_verified_at,
        recent_mfa_valid: data.recent_mfa_valid,
        backup_codes_remaining: data.backup_codes_remaining,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar MFA";
      if (message !== "UNAUTHORIZED") {
        setSecurityError(message);
      }
    }
  }, [fetchJson]);

  const postAdminMfa = useCallback(
    async (endpoint: string, body: Record<string, unknown> = {}) => {
      if (!token) throw new Error("NO_TOKEN");
      if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL no está configurada");

      return fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    },
    [token]
  );

  const handleMfaRequiredResponse = useCallback(
    async (response: Response, setMessage: (value: string | null) => void) => {
      if (response.status !== 403) return false;

      const payload: MfaRequiredResponse = await response.clone().json().catch(() => ({}));
      if (payload.code !== "MFA_REQUIRED") return false;

      const code = window.prompt(
        "Esta acción requiere MFA reciente. Ingresa un código TOTP o backup code:"
      );

      if (!code?.trim()) {
        setMessage("MFA requerido para completar esta acción.");
        return true;
      }

      const isBackupCode = /[A-Za-z-]/.test(code);
      const challengeResponse = await postAdminMfa("/api/admin/mfa/challenge", {
        [isBackupCode ? "backup_code" : "token"]: code.trim(),
      });
      const challengeData: AdminMfaVerifyResponse = await challengeResponse.json().catch(() => ({
        success: false,
      }));

      if (!challengeResponse.ok || !challengeData.success) {
        setMessage(challengeData.message || "Código MFA inválido.");
        return true;
      }

      await loadMfaStatus();
      setMessage("MFA verificado. Repite la acción para completarla.");
      return true;
    },
    [loadMfaStatus, postAdminMfa]
  );

  const startMfaSetup = useCallback(async () => {
    try {
      setMfaBusy(true);
      setSecurityError(null);
      setSecurityNotice(null);
      setMfaBackupCodes([]);
      const response = await postAdminMfa("/api/admin/mfa/setup");
      const data: AdminMfaSetupResponse = await response.json();

      if (!response.ok || !data.success || !data.otpauth_uri) {
        throw new Error(data.message || "No se pudo iniciar MFA");
      }

      setMfaSetupUri(data.otpauth_uri);
      setSecurityNotice("Escanea o copia el URI en tu app autenticadora y confirma el código.");
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "No se pudo iniciar MFA");
    } finally {
      setMfaBusy(false);
    }
  }, [postAdminMfa]);

  const verifyMfaSetup = useCallback(async () => {
    try {
      setMfaBusy(true);
      setSecurityError(null);
      setSecurityNotice(null);
      const response = await postAdminMfa("/api/admin/mfa/verify", {
        token: mfaSetupCode.trim(),
      });
      const data: AdminMfaVerifyResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo activar MFA");
      }

      setMfaBackupCodes(data.backup_codes || []);
      setMfaSetupCode("");
      setMfaSetupUri(null);
      setSecurityNotice("MFA activado. Guarda los backup codes ahora; no volverán a mostrarse.");
      await loadMfaStatus();
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "No se pudo activar MFA");
    } finally {
      setMfaBusy(false);
    }
  }, [loadMfaStatus, mfaSetupCode, postAdminMfa]);

  const verifyMfaChallenge = useCallback(async () => {
    try {
      setMfaBusy(true);
      setSecurityError(null);
      setSecurityNotice(null);
      const code = mfaChallengeCode.trim();
      const response = await postAdminMfa("/api/admin/mfa/challenge", {
        [/[A-Za-z-]/.test(code) ? "backup_code" : "token"]: code,
      });
      const data: AdminMfaVerifyResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo verificar MFA");
      }

      setMfaChallengeCode("");
      setSecurityNotice("MFA verificado por 15 minutos para acciones críticas.");
      await loadMfaStatus();
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "No se pudo verificar MFA");
    } finally {
      setMfaBusy(false);
    }
  }, [loadMfaStatus, mfaChallengeCode, postAdminMfa]);

  const disableMfa = useCallback(async () => {
    try {
      const confirmed = window.confirm("Deshabilitar MFA reduce la protección de acciones críticas. ¿Continuar?");
      if (!confirmed) return;

      setMfaBusy(true);
      setSecurityError(null);
      setSecurityNotice(null);
      const code = mfaDisableCode.trim();
      const body = code ? { [/[A-Za-z-]/.test(code) ? "backup_code" : "token"]: code } : {};
      const response = await postAdminMfa("/api/admin/mfa/disable", body);
      const data: AdminMfaVerifyResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo deshabilitar MFA");
      }

      setMfaDisableCode("");
      setMfaBackupCodes([]);
      setSecurityNotice("MFA fue deshabilitado.");
      await loadMfaStatus();
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "No se pudo deshabilitar MFA");
    } finally {
      setMfaBusy(false);
    }
  }, [loadMfaStatus, mfaDisableCode, postAdminMfa]);

  const loadReports = useCallback(async () => {
    try {
      setReportsLoadingState("loading");
      setReportsError(null);

      const response = await fetchJson("/api/admin/reports");
      const data: AdminReportsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar los reportes");
      }

      setReports(data.reports || []);
      setReportsLoadingState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cargando reportes";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setReportsError(message);
      setReportsLoadingState("error");
    }
  }, [fetchJson, logout]);

  const loadActions = useCallback(async () => {
    try {
      setActionsLoadingState("loading");
      setActionsError(null);

      const response = await fetchJson("/api/admin/report-actions");
      const data: AdminActionsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar el historial admin");
      }

      setActions(data.actions || []);
      setActionsLoadingState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cargando historial admin";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setActionsError(message);
      setActionsLoadingState("error");
    }
  }, [fetchJson, logout]);

  const loadRentalHistories = useCallback(async () => {
    try {
      setRentalHistoriesLoadingState("loading");
      setRentalHistoriesError(null);
      setRentalHistoriesNotice(null);

      const response = await fetchJson("/api/admin/rental-histories");
      const data: RentalHistoriesResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar los historiales arrendaticios");
      }

      setRentalHistories(data.rental_histories || []);
      setRentalHistoriesLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando historiales arrendaticios";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setRentalHistoriesError(message);
      setRentalHistoriesLoadingState("error");
    }
  }, [fetchJson, logout]);

  const loadIdentityVerifications = useCallback(async () => {
    try {
      setIdentityVerificationsLoadingState("loading");
      setIdentityVerificationsError(null);

      const params = new URLSearchParams({
        page: String(identityVerificationsPage),
        pageSize: "25",
      });

      Object.entries(identityVerificationFilters).forEach(([key, value]) => {
        const cleanValue = value.trim();
        if (cleanValue) params.set(key, cleanValue);
      });

      const response = await fetchJson(`/api/admin/identity-verifications?${params.toString()}`);
      const data: IdentityVerificationsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar las verificaciones de identidad");
      }

      setIdentityVerifications(data.verifications || []);
      setIdentityVerificationsPagination(data.pagination);
      setIdentityVerificationsLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando verificaciones de identidad";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setIdentityVerificationsError(message);
      setIdentityVerificationsLoadingState("error");
    }
  }, [fetchJson, identityVerificationFilters, identityVerificationsPage, logout]);

  const loadSignals = useCallback(async () => {
    try {
      setSignalsLoadingState("loading");
      setSignalsError(null);

      const response = await fetchJson("/api/admin/legal-case-signals");
      const data: LegalSignalsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar las señales judiciales");
      }

      setSignals(data.signals || []);
      setSignalsLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando señales judiciales";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setSignalsError(message);
      setSignalsLoadingState("error");
    }
  }, [fetchJson, logout]);

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoadingState("loading");
      setUsersError(null);

      if (!token) throw new Error("NO_TOKEN");
      if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL no está configurada");

      const response = await fetch(`${API_URL}/api/admin/users`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (response.status === 403) {
        setUsers([]);
        setUsersLoadingState("success");
        return;
      }

      if (response.status === 401) {
        logout("/login");
        return;
      }

      const data: AdminUsersResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar los usuarios");
      }

      setUsers(data.users || []);
      setUsersLoadingState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cargando usuarios";
      if (message === "NO_TOKEN") {
        logout("/login");
        return;
      }
      setUsersError(message);
      setUsersLoadingState("error");
    }
  }, [token, logout]);

  const loadPlanChangeLogs = useCallback(async () => {
    try {
      setPlanLogsLoadingState("loading");
      setPlanLogsError(null);

      const params = new URLSearchParams({
        page: String(planChangeLogsPage),
        pageSize: String(PLAN_CHANGE_LOGS_PAGE_SIZE),
      });

      Object.entries(planChangeLogFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/plan-change-logs?${params.toString()}`);
      const data: PlanChangeLogsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar el historial de planes");
      }

      setPlanChangeLogs(data.logs || []);
      setPlanChangeLogsPagination(
        data.pagination || {
          page: planChangeLogsPage,
          pageSize: PLAN_CHANGE_LOGS_PAGE_SIZE,
          total: data.logs?.length || 0,
          totalPages: 1,
        }
      );
      setPlanLogsLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando historial de planes";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setPlanLogsError(message);
      setPlanLogsLoadingState("error");
    }
  }, [fetchJson, logout, planChangeLogFilters, planChangeLogsPage]);

  const loadWompiPayments = useCallback(async () => {
    try {
      setWompiPaymentsLoadingState("loading");
      setWompiPaymentsError(null);

      const params = new URLSearchParams({
        page: String(wompiPaymentsPage),
        pageSize: String(WOMPI_PAYMENTS_PAGE_SIZE),
      });

      Object.entries(wompiPaymentFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/wompi-payments?${params.toString()}`);
      const data: AdminWompiPaymentsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar el historial de pagos Wompi");
      }

      setWompiPayments(data.data || []);
      setWompiPaymentsPagination(data.pagination);
      setWompiPaymentsLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando pagos Wompi";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setWompiPaymentsError(message);
      setWompiPaymentsLoadingState("error");
    }
  }, [fetchJson, logout, wompiPaymentFilters, wompiPaymentsPage]);

  const loadDataRequests = useCallback(async () => {
    try {
      setDataRequestsLoadingState("loading");
      setDataRequestsError(null);

      const params = new URLSearchParams({
        page: String(dataRequestsPage),
        pageSize: "25",
      });

      Object.entries(dataRequestFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/data-requests?${params.toString()}`);
      const data: AdminDataSubjectRequestsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar las solicitudes de datos");
      }

      setDataRequests(data.requests || []);
      setDataRequestsPagination(
        data.pagination || {
          page: dataRequestsPage,
          pageSize: 25,
          total: data.requests?.length || 0,
          totalPages: 1,
        }
      );
      setDataRequestsLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando solicitudes de datos";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setDataRequestsError(message);
      setDataRequestsLoadingState("error");
    }
  }, [dataRequestFilters, dataRequestsPage, fetchJson, logout]);

  const loadHumanReviewRequests = useCallback(async () => {
    try {
      setHumanReviewRequestsLoadingState("loading");
      setHumanReviewRequestsError(null);

      const params = new URLSearchParams({
        page: String(humanReviewRequestsPage),
        pageSize: "25",
      });

      Object.entries(humanReviewFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/human-review-requests?${params.toString()}`);
      const data: AdminHumanReviewRequestsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar las solicitudes de revision humana");
      }

      setHumanReviewRequests(data.requests || []);
      setHumanReviewRequestsPagination(
        data.pagination || {
          page: humanReviewRequestsPage,
          pageSize: 25,
          total: data.requests?.length || 0,
          totalPages: 1,
        }
      );
      setHumanReviewRequestsLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando solicitudes de revision humana";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setHumanReviewRequestsError(message);
      setHumanReviewRequestsLoadingState("error");
    }
  }, [fetchJson, humanReviewFilters, humanReviewRequestsPage, logout]);

  const loadDataDisputes = useCallback(async () => {
    try {
      setDataDisputesLoadingState("loading");
      setDataDisputesError(null);

      const params = new URLSearchParams({
        page: String(dataDisputesPage),
        pageSize: "25",
      });

      Object.entries(dataDisputeFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/disputes?${params.toString()}`);
      const data: AdminDataDisputesResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar las disputas");
      }

      setDataDisputes(data.disputes || []);
      setDataDisputesPagination(
        data.pagination || {
          page: dataDisputesPage,
          pageSize: 25,
          total: data.disputes?.length || 0,
          totalPages: 1,
        }
      );
      setDataDisputesLoadingState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cargando disputas";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setDataDisputesError(message);
      setDataDisputesLoadingState("error");
    }
  }, [dataDisputeFilters, dataDisputesPage, fetchJson, logout]);

  const loadDataInventory = useCallback(async () => {
    try {
      setDataInventoryLoadingState("loading");
      setDataInventoryError(null);

      const params = new URLSearchParams({
        page: String(dataInventoryPage),
        pageSize: "25",
      });

      Object.entries(dataInventoryFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/data-inventory?${params.toString()}`);
      const data: DataInventoryResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar el inventario de datos");
      }

      setDataInventoryItems(data.items || []);
      setDataInventoryPagination(
        data.pagination || {
          page: dataInventoryPage,
          pageSize: 25,
          total: data.items?.length || 0,
          totalPages: 1,
        }
      );
      setDataInventoryLoadingState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error cargando inventario de datos";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setDataInventoryError(message);
      setDataInventoryLoadingState("error");
    }
  }, [dataInventoryFilters, dataInventoryPage, fetchJson, logout]);

  const loadAuditLogs = useCallback(async () => {
    try {
      setAuditLogsLoadingState("loading");
      setAuditLogsError(null);

      const params = new URLSearchParams({
        page: String(auditLogsPage),
        pageSize: String(AUDIT_LOGS_PAGE_SIZE),
      });

      Object.entries(auditFilters).forEach(([key, value]) => {
        const normalized = value.trim();
        if (normalized) {
          params.set(key, normalized);
        }
      });

      const response = await fetchJson(`/api/admin/audit-logs?${params.toString()}`);
      const data: AdminAuditLogsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo cargar la auditoria");
      }

      setAuditLogs(data.logs || []);
      setAuditLogsPagination(
        data.pagination || {
          page: auditLogsPage,
          pageSize: AUDIT_LOGS_PAGE_SIZE,
          total: data.logs?.length || 0,
          totalPages: 1,
        }
      );
      setAuditLogsLoadingState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cargando auditoria";
      if (message === "UNAUTHORIZED") {
        logout("/login");
        return;
      }
      setAuditLogsError(message);
      setAuditLogsLoadingState("error");
    }
  }, [auditFilters, auditLogsPage, fetchJson, logout]);

  const loadMetrics = useCallback(async () => {
    try {
      setMetricsState({ status: "loading" });

      if (!token) throw new Error("NO_TOKEN");
      if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL no está configurada");

      const response = await fetch(`${API_URL}/api/admin/metrics`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      if (response.status === 403) {
        setMetricsState({ status: "forbidden" });
        return;
      }

      if (response.status === 401) {
        logout("/login");
        return;
      }

      const data: AdminMetricsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron cargar las métricas.");
      }

      setMetricsState({ status: "success", data: data.metrics });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudieron cargar las métricas.";
      setMetricsState({ status: "error", message });
    }
  }, [token, logout]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadMetrics(),
        loadReports(),
        loadActions(),
        loadRentalHistories(),
        loadSignals(),
        loadUsers(),
        loadMfaStatus(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    loadMetrics,
    loadReports,
    loadActions,
    loadRentalHistories,
    loadSignals,
    loadUsers,
    loadMfaStatus,
  ]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    if (initialAdminLoadTokenRef.current === token) return;
    initialAdminLoadTokenRef.current = token;
    loadAll();
  }, [isLoading, isAuthenticated, token, loadAll]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadWompiPayments();
  }, [isLoading, isAuthenticated, token, loadWompiPayments]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadPlanChangeLogs();
  }, [isLoading, isAuthenticated, token, loadPlanChangeLogs]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadDataRequests();
  }, [isLoading, isAuthenticated, token, loadDataRequests]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadHumanReviewRequests();
  }, [isLoading, isAuthenticated, token, loadHumanReviewRequests]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadDataDisputes();
  }, [isLoading, isAuthenticated, token, loadDataDisputes]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadDataInventory();
  }, [isLoading, isAuthenticated, token, loadDataInventory]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadIdentityVerifications();
  }, [isLoading, isAuthenticated, token, loadIdentityVerifications]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return;
    loadAuditLogs();
  }, [isLoading, isAuthenticated, token, loadAuditLogs]);

  const refreshAdminData = useCallback(async () => {
    await Promise.all([
      loadAll(),
      loadWompiPayments(),
      loadPlanChangeLogs(),
      loadDataRequests(),
      loadHumanReviewRequests(),
      loadDataDisputes(),
      loadDataInventory(),
      loadIdentityVerifications(),
      loadAuditLogs(),
    ]);
  }, [
    loadAll,
    loadWompiPayments,
    loadPlanChangeLogs,
    loadDataRequests,
    loadHumanReviewRequests,
    loadDataDisputes,
    loadDataInventory,
    loadIdentityVerifications,
    loadAuditLogs,
  ]);

  const synchronizeIdentityVerificationData = useCallback(async () => {
    await Promise.allSettled([
      loadIdentityVerifications(),
      loadMetrics(),
      loadActions(),
      loadAuditLogs(),
      loadUsers(),
    ]);
  }, [loadIdentityVerifications, loadMetrics, loadActions, loadAuditLogs, loadUsers]);


  const filteredReports = useMemo(() => {
    const searchValue = normalizeText(search);

    return reports.filter((report) => {
      const matchesProblem =
        problemFilter === "all" || report.tipo_problema === problemFilter;

      const searchable = [
        report.tenants?.nombre,
        report.tenants?.cedula,
        report.tenants?.ciudad,
        report.descripcion,
        report.tipo_problema,
        report.reportado_por,
        report.users?.nombre,
        report.users?.email,
        report.users?.tipo_usuario,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !searchValue || searchable.includes(searchValue);

      return matchesProblem && matchesSearch;
    });
  }, [reports, search, problemFilter]);

  const filteredSignals = useMemo(() => {
    const searchValue = normalizeText(signalSearch);

    return signals.filter((signal) => {
      const matchesStatus =
        signalStatusFilter === "all" || signal.status === signalStatusFilter;

      const searchable = [
        signal.tenants?.nombre,
        signal.tenants?.cedula,
        signal.tenants?.ciudad,
        signal.cedula_consultada,
        signal.process_type,
        signal.process_subject,
        signal.court_name,
        signal.city,
        signal.source,
        signal.status,
        signal.dispute_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !searchValue || searchable.includes(searchValue);

      return matchesStatus && matchesSearch;
    });
  }, [signals, signalSearch, signalStatusFilter]);

  const reportStats = useMemo(() => {
    const byType = reports.reduce<Record<string, number>>((acc, report) => {
      acc[report.tipo_problema] = (acc[report.tipo_problema] || 0) + 1;
      return acc;
    }, {});

    return {
      total: reports.length,
      impago: byType.impago || 0,
      danos: byType.danos || 0,
      desalojo: byType.desalojo || 0,
      ruido: byType.ruido || 0,
      otros: byType.otros || 0,
    };
  }, [reports]);

  const signalStats = useMemo(() => {
    const base = {
      total: signals.length,
      detected: 0,
      under_review: 0,
      verified: 0,
      rejected: 0,
    };

    for (const signal of signals) {
      if (signal.status === "detected") base.detected += 1;
      if (signal.status === "under_review") base.under_review += 1;
      if (signal.status === "verified") base.verified += 1;
      if (signal.status === "rejected") base.rejected += 1;
    }

    return base;
  }, [signals]);

  const reportsPageCount = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE));
  const signalsPageCount = Math.max(1, Math.ceil(filteredSignals.length / ITEMS_PER_PAGE));

  const [reportsPage, setReportsPage] = useState(1);
  const [signalsPage, setSignalsPage] = useState(1);

  useEffect(() => {
    setReportsPage(1);
  }, [filteredReports.length]);

  useEffect(() => {
    setSignalsPage(1);
  }, [filteredSignals.length]);

  const paginatedReports = useMemo(() => {
    const start = (reportsPage - 1) * ITEMS_PER_PAGE;
    return filteredReports.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReports, reportsPage]);

  const paginatedSignals = useMemo(() => {
    const start = (signalsPage - 1) * ITEMS_PER_PAGE;
    return filteredSignals.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSignals, signalsPage]);

  const openDecision = useCallback(
    (reportId: string, action: ReportReviewAction) => {
      const notes =
        action === "mark_in_review" ||
        action === "request_more_info" ||
        action === "block_scoring"
          ? window.prompt("Notas administrativas opcionales:")?.trim()
          : undefined;

      if (
        (action === "mark_in_review" ||
          action === "request_more_info" ||
          action === "block_scoring") &&
        notes === undefined
      ) {
        return;
      }

      if (action === "reject") {
        const rejectionReason = window.prompt("Motivo obligatorio del rechazo:");
        if (!rejectionReason?.trim()) {
          setReportsError("Debes indicar un motivo para rechazar el reporte.");
          return;
        }
        setDecision({
          reportId,
          action,
          rejection_reason: rejectionReason.trim(),
        });
        return;
      }

      setDecision({ reportId, action, notes });
    },
    []
  );

  const closeDecision = useCallback(() => {
    if (processingId) return;
    setDecision(null);
  }, [processingId]);

  const confirmDecision = useCallback(async () => {
    if (!token || !decision || !API_URL) return;

    try {
      setProcessingId(decision.reportId);
      setReportsError(null);

      const response = await fetch(
        `${API_URL}/api/admin/reports/${decision.reportId}/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: decision.action,
            notes: decision.notes,
            rejection_reason: decision.rejection_reason,
          }),
        }
      );

      if (response.status === 403 && (await handleMfaRequiredResponse(response, setReportsError))) {
        return;
      }

      if (response.status === 401 || response.status === 403) {
        logout("/login");
        return;
      }

      const data: UpdateReportResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo actualizar el reporte");
      }

      if (decision.action === "approve" || decision.action === "reject") {
        setReports((current) =>
          current.filter((report) => report.id !== decision.reportId)
        );
      } else if (data.report) {
        setReports((current) =>
          current.map((report) =>
            report.id === decision.reportId ? { ...report, ...data.report } : report
          )
        );
      }
      setDecision(null);

      await loadActions();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error actualizando reporte";
      setReportsError(message);
    } finally {
      setProcessingId(null);
    }
  }, [token, decision, logout, loadActions, handleMfaRequiredResponse]);

  const updateReportNotice = useCallback(
    async (reportId: string, action: ReportNoticeAction) => {
      if (!token || !API_URL) return;

      const requiresNotes = [
        "waive_notice",
        "record_contradiction",
        "mark_contradiction_accepted",
        "mark_contradiction_rejected",
      ].includes(action);
      const notes = window.prompt(
        requiresNotes ? "Nota o resumen requerido:" : "Nota administrativa opcional:"
      );

      if (notes === null) return;
      if (requiresNotes && !notes.trim()) {
        setReportsError("Debes indicar una nota o resumen para esta accion.");
        return;
      }

      try {
        setProcessingId(reportId);
        setReportsError(null);

        const response = await fetch(`${API_URL}/api/admin/reports/${reportId}/notice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            notes: notes.trim() || undefined,
            contradiction_summary: notes.trim() || undefined,
            notice_channel: "manual_admin",
          }),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setReportsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: UpdateReportResponse = await response.json();

        if (!response.ok || !data.success || !data.report) {
          throw new Error(data.message || "No se pudo actualizar notificacion/contradiccion");
        }

        setReports((current) =>
          current.map((report) =>
            report.id === reportId ? { ...report, ...data.report } : report
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error actualizando notificacion/contradiccion";
        setReportsError(message);
      } finally {
        setProcessingId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const updateRentalHistoryStatus = useCallback(
    async (historyId: string, status: "verified" | "rejected" | "disputed") => {
      if (!token || !API_URL) return;

      const actionLabels = {
        verified: "verificar",
        rejected: "rechazar",
        disputed: "marcar como disputado",
      } as const;
      const notes = window.prompt(
        `Notas para ${actionLabels[status]} este historial arrendaticio:`,
        status === "rejected" ? "Rechazado por revisión administrativa" : ""
      );

      if (notes === null) return;

      try {
        setRentalHistoryActionId(historyId);
        setRentalHistoriesError(null);

        const response = await fetch(
          `${API_URL}/api/admin/rental-histories/${historyId}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              status,
              notes: notes.trim() || undefined,
            }),
          }
        );

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setRentalHistoriesError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: RentalHistoryStatusResponse = await response.json();

        if (!response.ok || !data.success || !data.rental_history) {
          throw new Error(data.message || "No se pudo actualizar el historial arrendaticio");
        }

        setRentalHistories((current) =>
          current.map((history) =>
            history.id === historyId ? data.rental_history as RentalHistory : history
          )
        );

        if (status === "verified") {
          if (data.credit_grant?.reason === "granted") {
            setRentalHistoriesNotice("Historial verificado. Se otorgó 1 crédito al aportante.");
          } else if (data.credit_grant?.reason === "monthly_limit_reached") {
            setRentalHistoriesNotice(
              "Historial verificado. No se otorgó crédito porque el usuario alcanzó el máximo mensual."
            );
          } else {
            setRentalHistoriesNotice(null);
          }
        } else {
          setRentalHistoriesNotice(null);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error actualizando historial arrendaticio";
        setRentalHistoriesError(message);
      } finally {
        setRentalHistoryActionId(null);
      }
    },
    [API_URL, token, logout, handleMfaRequiredResponse]
  );

  const updateIdentityVerification = useCallback(
    async (documentId: string, action: "approve" | "reject") => {
      if (!token || !API_URL) return;
      if (identityActionControllerRef.current?.getPending()) return;

      const notes = window.prompt(
        action === "approve"
          ? "Notas para aprobar este documento de identidad:"
          : "Motivo para rechazar este documento de identidad:",
        ""
      );

      if (notes === null) return;
      if (action === "reject" && !notes.trim()) {
        setIdentityVerificationsError("El rechazo requiere un motivo.");
        return;
      }

      setIdentityVerificationsError(null);
      setIdentityVerificationsNotice(null);

      const payload = {
        action,
        notes: notes.trim() || undefined,
      };
      const controller = identityActionControllerRef.current;
      if (!controller) return;

      const result = await controller.execute(
        { operation: action, documentId, payload },
        {
          patch: async (pending): Promise<IdentityVerificationPatchResult> => {
            const response = await fetch(
              `${API_URL}/api/admin/identity-verifications/documents/${pending.documentId}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(pending.payload),
              }
            );

            if (response.status === 403) {
              const mfaPayload: MfaRequiredResponse = await response
                .clone()
                .json()
                .catch(() => ({}));
              if (mfaPayload.code === "MFA_REQUIRED") {
                return { type: "mfa_required" };
              }
            }

            if (response.status === 409) {
              return { type: "conflict" };
            }

            if (response.status === 401 || response.status === 403) {
              logout("/login");
              return { type: "error", message: "Sesión administrativa no autorizada." };
            }

            const data: IdentityVerificationUpdateResponse = await response
              .json()
              .catch(() => ({ success: false }));

            if (!response.ok || !data.success || !data.verification) {
              return {
                type: "error",
                message: data.message || "No se pudo actualizar la verificación",
              };
            }

            return { type: "success" };
          },
          challenge: async () => {
            const code = window.prompt(
              "Esta acción requiere MFA reciente. Ingresa un código TOTP o backup code:"
            );

            if (!code?.trim()) {
              return {
                success: false as const,
                message: "MFA requerido para completar esta acción.",
              };
            }

            setMfaBusy(true);
            try {
              const isBackupCode = /[A-Za-z-]/.test(code);
              const challengeResponse = await postAdminMfa("/api/admin/mfa/challenge", {
                [isBackupCode ? "backup_code" : "token"]: code.trim(),
              });
              const challengeData: AdminMfaVerifyResponse = await challengeResponse
                .json()
                .catch(() => ({ success: false }));

              if (!challengeResponse.ok || !challengeData.success) {
                return {
                  success: false as const,
                  message: challengeData.message || "Código MFA inválido.",
                };
              }

              await loadMfaStatus();
              return { success: true as const };
            } finally {
              setMfaBusy(false);
            }
          },
          synchronize: synchronizeIdentityVerificationData,
          onPendingChange: setPendingIdentityAction,
          onMfaVerified: () => {
            setIdentityVerificationsNotice("MFA verificado. Completando operación…");
          },
          onMutationSettled: (settledDocumentId) => {
            setIdentityVerifications((current) =>
              current.filter((item) => item.secure_document_id !== settledDocumentId)
            );
          },
        }
      );

      if (result.status === "success") {
        setIdentityVerificationsNotice(
          result.operation === "approve"
            ? "Documento aprobado correctamente."
            : "Documento rechazado correctamente."
        );
      } else if (result.status === "conflict") {
        setIdentityVerificationsNotice(
          "El registro ya fue procesado. Los datos fueron actualizados."
        );
      } else if (result.status === "challenge_failed" || result.status === "error") {
        setIdentityVerificationsNotice(null);
        setIdentityVerificationsError(result.message);
      } else if (result.status === "repeated_mfa_required") {
        setIdentityVerificationsNotice(null);
        setIdentityVerificationsError(
          "No fue posible completar la operación después de verificar MFA. Inténtalo nuevamente desde la solicitud."
        );
      }
    },
    [
      API_URL,
      token,
      logout,
      postAdminMfa,
      loadMfaStatus,
      synchronizeIdentityVerificationData,
    ]
  );

  const openIdentityDocument = useCallback(
    async (documentId: string) => {
      if (!token || !API_URL) return;

      try {
        setIdentityVerificationsError(null);

        const response = await fetch(`${API_URL}/api/documents/${documentId}/signed-read`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: { success: boolean; signed_url?: string; message?: string } = await response.json();

        if (!response.ok || !data.success || !data.signed_url) {
          throw new Error(data.message || "No se pudo abrir el documento");
        }

        window.open(data.signed_url, "_blank", "noopener,noreferrer");
      } catch (err) {
        setIdentityVerificationsError(
          err instanceof Error ? err.message : "Error abriendo documento"
        );
      }
    },
    [API_URL, token, logout]
  );

  const openSignalDecision = useCallback(
    (
      signalId: string,
      action: NonNullable<SignalDecisionState>["action"],
      payload: Record<string, unknown>
    ) => {
      setSignalDecision({ signalId, action, payload });
    },
    []
  );

  const closeSignalDecision = useCallback(() => {
    if (processingId) return;
    setSignalDecision(null);
  }, [processingId]);

  const confirmSignalDecision = useCallback(async () => {
    if (!token || !signalDecision || !API_URL) return;

    try {
      setProcessingId(signalDecision.signalId);
      setSignalsError(null);

      const response = await fetch(
        `${API_URL}/api/admin/legal-case-signals/${signalDecision.signalId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(signalDecision.payload),
        }
      );

      if (response.status === 403 && (await handleMfaRequiredResponse(response, setSignalsError))) {
        return;
      }

      if (response.status === 401 || response.status === 403) {
        logout("/login");
        return;
      }

      const data: UpdateLegalSignalResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudo actualizar la señal");
      }

      setSignalDecision(null);
      await loadSignals();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error actualizando señal";
      setSignalsError(message);
    } finally {
      setProcessingId(null);
    }
  }, [token, signalDecision, logout, loadSignals, handleMfaRequiredResponse]);

  const handleUserPlanChange = useCallback((userId: string, planType: AdminPlanType) => {
    setUsers((current) =>
      current.map((adminUser) =>
        adminUser.id === userId
          ? {
              ...adminUser,
              plan_type: planType,
              daily_search_limit: getPlanLimit(planType),
            }
          : adminUser
      )
    );
  }, []);

  const saveUserPlan = useCallback(
    async (adminUser: AdminUser) => {
      if (!token || !API_URL) return;

      try {
        setSavingId(adminUser.id);
        setUsersError(null);

        const response = await fetch(`${API_URL}/api/admin/users/${adminUser.id}/plan`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan_type: adminUser.plan_type }),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setUsersError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: UpdateUserPlanResponse = await response.json();

        if (!response.ok || !data.success || !data.user) {
          throw new Error(data.message || "No se pudo actualizar el plan");
        }

        setUsers((current) =>
          current.map((item) => (item.id === data.user?.id ? data.user : item))
        );
        await loadPlanChangeLogs();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo actualizar el plan";
        alert(message);
        setUsersError("No se pudo guardar el cambio de plan.");
        await loadUsers();
      } finally {
        setSavingId(null);
      }
    },
    [token, logout, loadUsers, loadPlanChangeLogs, handleMfaRequiredResponse]
  );

  const applyWompiPaymentFilters = useCallback(() => {
    setWompiPaymentsPage(1);
    setWompiPaymentFilters({
      status: wompiPaymentDraftFilters.status,
      plan_type: wompiPaymentDraftFilters.plan_type,
      reference: wompiPaymentDraftFilters.reference.trim(),
      user_email: wompiPaymentDraftFilters.user_email.trim(),
    });
  }, [wompiPaymentDraftFilters]);

  const resetWompiPaymentFilters = useCallback(() => {
    setWompiPaymentsPage(1);
    setWompiPaymentDraftFilters(EMPTY_WOMPI_PAYMENT_FILTERS);
    setWompiPaymentFilters(EMPTY_WOMPI_PAYMENT_FILTERS);
  }, []);

  const applyDataRequestFilters = useCallback(() => {
    setDataRequestsPage(1);
    setDataRequestFilters({
      status: dataRequestDraftFilters.status.trim(),
      request_type: dataRequestDraftFilters.request_type.trim(),
      requester_email: dataRequestDraftFilters.requester_email.trim(),
    });
  }, [dataRequestDraftFilters]);

  const resetDataRequestFilters = useCallback(() => {
    setDataRequestsPage(1);
    setDataRequestDraftFilters(EMPTY_DATA_REQUEST_FILTERS);
    setDataRequestFilters(EMPTY_DATA_REQUEST_FILTERS);
  }, []);

  const applyHumanReviewFilters = useCallback(() => {
    setHumanReviewRequestsPage(1);
    setHumanReviewFilters({
      status: humanReviewDraftFilters.status.trim(),
      reason: humanReviewDraftFilters.reason.trim(),
      requester_email: humanReviewDraftFilters.requester_email.trim(),
      requester_document_id: humanReviewDraftFilters.requester_document_id.trim(),
    });
  }, [humanReviewDraftFilters]);

  const resetHumanReviewFilters = useCallback(() => {
    setHumanReviewRequestsPage(1);
    setHumanReviewDraftFilters(EMPTY_HUMAN_REVIEW_FILTERS);
    setHumanReviewFilters(EMPTY_HUMAN_REVIEW_FILTERS);
  }, []);

  const applyDataDisputeFilters = useCallback(() => {
    setDataDisputesPage(1);
    setDataDisputeFilters({
      status: dataDisputeDraftFilters.status.trim(),
      target_type: dataDisputeDraftFilters.target_type.trim(),
      dispute_type: dataDisputeDraftFilters.dispute_type.trim(),
      requester_email: dataDisputeDraftFilters.requester_email.trim(),
      requester_document_id: dataDisputeDraftFilters.requester_document_id.trim(),
    });
  }, [dataDisputeDraftFilters]);

  const resetDataDisputeFilters = useCallback(() => {
    setDataDisputesPage(1);
    setDataDisputeDraftFilters(EMPTY_DATA_DISPUTE_FILTERS);
    setDataDisputeFilters(EMPTY_DATA_DISPUTE_FILTERS);
  }, []);

  const applyDataInventoryFilters = useCallback(() => {
    setDataInventoryPage(1);
    setDataInventoryFilters({
      data_domain: dataInventoryDraftFilters.data_domain.trim(),
      data_category: dataInventoryDraftFilters.data_category.trim(),
      sensitivity_level: dataInventoryDraftFilters.sensitivity_level.trim(),
      legal_basis: dataInventoryDraftFilters.legal_basis.trim(),
      impacts_scoring: dataInventoryDraftFilters.impacts_scoring.trim(),
      is_active: dataInventoryDraftFilters.is_active.trim(),
    });
  }, [dataInventoryDraftFilters]);

  const resetDataInventoryFilters = useCallback(() => {
    setDataInventoryPage(1);
    setDataInventoryDraftFilters(EMPTY_DATA_INVENTORY_FILTERS);
    setDataInventoryFilters(EMPTY_DATA_INVENTORY_FILTERS);
  }, []);

  const applyPlanChangeLogFilters = useCallback(() => {
    setPlanChangeLogsPage(1);
    setPlanChangeLogFilters({
      user_email: planChangeLogDraftFilters.user_email.trim(),
      reason: planChangeLogDraftFilters.reason.trim(),
      previous_plan: planChangeLogDraftFilters.previous_plan,
      new_plan: planChangeLogDraftFilters.new_plan,
    });
  }, [planChangeLogDraftFilters]);

  const resetPlanChangeLogFilters = useCallback(() => {
    setPlanChangeLogsPage(1);
    setPlanChangeLogDraftFilters(EMPTY_PLAN_CHANGE_LOG_FILTERS);
    setPlanChangeLogFilters(EMPTY_PLAN_CHANGE_LOG_FILTERS);
  }, []);

  const verifyWompiPayment = useCallback(
    async (paymentId: string) => {
      if (!token || !API_URL) return;

      try {
        setVerifyingPaymentId(paymentId);
        setWompiVerifyResults((current) => {
          const next = { ...current };
          delete next[paymentId];
          return next;
        });

        const response = await fetch(
          `${API_URL}/api/admin/wompi-payments/${paymentId}/verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setWompiPaymentsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const payload: AdminWompiVerifyResponse = await response.json();

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(
            payload.message || "No se pudo verificar este pago en Wompi"
          );
        }

        setWompiVerifyResults((current) => ({
          ...current,
          [paymentId]: { status: "success", data: payload.data as AdminWompiVerifyResult },
        }));

        setWompiPayments((current) =>
          current.map((payment) =>
            payment.payment_id === paymentId
              ? {
                  ...payment,
                  wompi_status: payload.data?.wompi_status_current || payment.wompi_status,
                }
              : payment
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error verificando pago Wompi";
        setWompiVerifyResults((current) => ({
          ...current,
          [paymentId]: { status: "error", message },
        }));
      } finally {
        setVerifyingPaymentId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const reconcileWompiPayment = useCallback(
    async (paymentId: string) => {
      if (!token || !API_URL) return;

      const confirmed = window.confirm(
        "Esta acción consultará Wompi y activará el plan solo si la transacción está APPROVED y coincide con el pago interno. ¿Continuar?"
      );

      if (!confirmed) return;

      try {
        setReconcilingPaymentId(paymentId);
        setWompiReconcileResults((current) => {
          const next = { ...current };
          delete next[paymentId];
          return next;
        });

        const response = await fetch(
          `${API_URL}/api/admin/wompi-payments/${paymentId}/reconcile`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setWompiPaymentsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const payload: AdminWompiReconcileResponse = await response.json();

        if (!response.ok || !payload.success || !payload.data) {
          setWompiReconcileResults((current) => ({
            ...current,
            [paymentId]: {
              status: "error",
              message: payload.message || "No se pudo reconciliar este pago",
              data: payload.data,
            },
          }));
          return;
        }

        setWompiReconcileResults((current) => ({
          ...current,
          [paymentId]: { status: "success", data: payload.data as AdminWompiReconcileResult },
        }));

        await loadWompiPayments();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error reconciliando pago Wompi";
        setWompiReconcileResults((current) => ({
          ...current,
          [paymentId]: { status: "error", message },
        }));
      } finally {
        setReconcilingPaymentId(null);
      }
    },
    [token, logout, loadWompiPayments, handleMfaRequiredResponse]
  );

  const updateDataRequest = useCallback(
    async (
      requestId: string,
      payload: {
        status?: DataSubjectRequestStatus;
        admin_notes?: string | null;
      }
    ) => {
      if (!token || !API_URL) return;

      try {
        setSavingDataRequestId(requestId);
        setDataRequestsError(null);

        const response = await fetch(`${API_URL}/api/admin/data-requests/${requestId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setDataRequestsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: AdminDataSubjectRequestUpdateResponse = await response.json();

        if (!response.ok || !data.success || !data.request) {
          throw new Error(data.message || "No se pudo actualizar la solicitud");
        }

        setDataRequests((current) =>
          current.map((request) =>
            request.id === requestId ? data.request as AdminDataSubjectRequest : request
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo actualizar la solicitud";
        setDataRequestsError(message);
      } finally {
        setSavingDataRequestId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const updateHumanReviewRequest = useCallback(
    async (
      requestId: string,
      payload: {
        status?: HumanReviewRequestStatus;
        admin_notes?: string | null;
        review_summary?: string | null;
      }
    ) => {
      if (!token || !API_URL) return;

      try {
        setSavingHumanReviewRequestId(requestId);
        setHumanReviewRequestsError(null);

        const response = await fetch(`${API_URL}/api/admin/human-review-requests/${requestId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setHumanReviewRequestsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: AdminHumanReviewRequestUpdateResponse = await response.json();

        if (!response.ok || !data.success || !data.request) {
          throw new Error(data.message || "No se pudo actualizar la solicitud de revision");
        }

        setHumanReviewRequests((current) =>
          current.map((request) =>
            request.id === requestId ? data.request as AdminHumanReviewRequest : request
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo actualizar la solicitud de revision";
        setHumanReviewRequestsError(message);
      } finally {
        setSavingHumanReviewRequestId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const updateDataDispute = useCallback(
    async (
      disputeId: string,
      payload: {
        status?: DataDisputeStatus;
        admin_notes?: string | null;
        resolution_summary?: string | null;
      }
    ) => {
      if (!token || !API_URL) return;

      try {
        setSavingDataDisputeId(disputeId);
        setDataDisputesError(null);

        const response = await fetch(`${API_URL}/api/admin/disputes/${disputeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setDataDisputesError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: AdminDataDisputeUpdateResponse = await response.json();

        if (!response.ok || !data.success || !data.dispute) {
          throw new Error(data.message || "No se pudo actualizar la disputa");
        }

        setDataDisputes((current) =>
          current.map((dispute) =>
            dispute.id === disputeId ? data.dispute as AdminDataDispute : dispute
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo actualizar la disputa";
        setDataDisputesError(message);
      } finally {
        setSavingDataDisputeId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const resetDataInventoryForm = useCallback(() => {
    setEditingDataInventoryId(null);
    setDataInventoryForm(EMPTY_DATA_INVENTORY_FORM);
  }, []);

  const editDataInventoryItem = useCallback((item: DataInventoryItem) => {
    setEditingDataInventoryId(item.id);
    setDataInventoryForm({
      data_domain: item.data_domain,
      field_name: item.field_name,
      description: item.description,
      data_category: item.data_category,
      sensitivity_level: item.sensitivity_level,
      source_type: item.source_type,
      legal_basis: item.legal_basis,
      purpose: item.purpose,
      retention_policy: item.retention_policy,
      retention_days: item.retention_days === null ? "" : String(item.retention_days),
      impacts_scoring: item.impacts_scoring,
      requires_consent: item.requires_consent,
      is_public_source: item.is_public_source,
      is_active: item.is_active,
    });
  }, []);

  const saveDataInventoryItem = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token || !API_URL) return;

      const payload = toDataInventoryPayload(dataInventoryForm);
      const endpoint = editingDataInventoryId
        ? `${API_URL}/api/admin/data-inventory/${editingDataInventoryId}`
        : `${API_URL}/api/admin/data-inventory`;

      try {
        setSavingDataInventoryId(editingDataInventoryId || "new");
        setDataInventoryError(null);

        const response = await fetch(endpoint, {
          method: editingDataInventoryId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: DataInventoryMutationResponse = await response.json();

        if (!response.ok || !data.success || !data.item) {
          throw new Error(data.message || "No se pudo guardar el item de inventario");
        }

        if (editingDataInventoryId) {
          setDataInventoryItems((current) =>
            current.map((item) => (item.id === data.item?.id ? data.item : item))
          );
        } else {
          setDataInventoryItems((current) => [data.item as DataInventoryItem, ...current]);
          setDataInventoryPagination((current) => ({
            ...current,
            total: current.total + 1,
          }));
        }

        resetDataInventoryForm();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo guardar el item de inventario";
        setDataInventoryError(message);
      } finally {
        setSavingDataInventoryId(null);
      }
    },
    [dataInventoryForm, editingDataInventoryId, logout, resetDataInventoryForm, token]
  );

  const deactivateDataInventoryItem = useCallback(
    async (itemId: string) => {
      if (!token || !API_URL) return;

      try {
        setSavingDataInventoryId(itemId);
        setDataInventoryError(null);

        const response = await fetch(`${API_URL}/api/admin/data-inventory/${itemId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_active: false }),
        });

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: DataInventoryMutationResponse = await response.json();

        if (!response.ok || !data.success || !data.item) {
          throw new Error(data.message || "No se pudo desactivar el item");
        }

        setDataInventoryItems((current) =>
          current.map((item) => (item.id === itemId ? data.item as DataInventoryItem : item))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo desactivar el item";
        setDataInventoryError(message);
      } finally {
        setSavingDataInventoryId(null);
      }
    },
    [token, logout]
  );

  const updateReportLegalTrace = useCallback(
    async (report: AdminReport) => {
      if (!token || !API_URL) return;

      const payload = collectLegalTracePayload(report);
      if (!payload) return;

      try {
        setLegalTraceSavingId(report.id);
        setReportsError(null);

        const response = await fetch(`${API_URL}/api/admin/reports/${report.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setReportsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: UpdateReportResponse = await response.json();

        if (!response.ok || !data.success || !data.report) {
          throw new Error(data.message || "No se pudo actualizar la trazabilidad");
        }

        setReports((current) =>
          current.map((currentReport) =>
            currentReport.id === report.id ? data.report as AdminReport : currentReport
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error actualizando trazabilidad";
        setReportsError(message);
      } finally {
        setLegalTraceSavingId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const updateSignalLegalTrace = useCallback(
    async (signal: LegalCaseSignal) => {
      if (!token || !API_URL) return;

      const payload = collectLegalTracePayload({
        ...signal,
        source_name: signal.source_name || signal.source,
      });
      if (!payload) return;

      try {
        setLegalTraceSavingId(signal.id);
        setSignalsError(null);

        const response = await fetch(`${API_URL}/api/admin/legal-case-signals/${signal.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 403 && (await handleMfaRequiredResponse(response, setSignalsError))) {
          return;
        }

        if (response.status === 401 || response.status === 403) {
          logout("/login");
          return;
        }

        const data: UpdateLegalSignalResponse = await response.json();

        if (!response.ok || !data.success || !data.signal) {
          throw new Error(data.message || "No se pudo actualizar la trazabilidad");
        }

        setSignals((current) =>
          current.map((currentSignal) =>
            currentSignal.id === signal.id ? data.signal as LegalCaseSignal : currentSignal
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Error actualizando trazabilidad";
        setSignalsError(message);
      } finally {
        setLegalTraceSavingId(null);
      }
    },
    [token, logout, handleMfaRequiredResponse]
  );

  const commercialMetrics =
    metricsState.status === "success" ? metricsState.data : null;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="text-sm text-gray-600">Validando acceso...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <PlatformShell
      variant="admin"
      title="Operations Center"
      eyebrow="Admin"
      description="Moderación, verificación, pagos, auditoría y seguridad en una consola operacional."
      user={user}
      topbarActions={
        <button
          type="button"
          onClick={refreshAdminData}
          disabled={refreshing}
          className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      }
    >
      <PageContainer>
      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex w-full flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SystemStatusBadge tone={mfaStatus?.mfa_enabled ? "success" : "warning"}>
                {mfaStatus?.mfa_enabled ? "MFA activo" : "MFA pendiente"}
              </SystemStatusBadge>
              <SystemStatusBadge tone={criticalWorkCount > 0 ? "warning" : "success"}>
                {criticalWorkCount.toLocaleString("es-CO")} tareas abiertas
              </SystemStatusBadge>
              <SystemStatusBadge tone="neutral">{user.tipo_usuario}</SystemStatusBadge>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">
              Operations Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Priorizacion diaria para verificacion, moderacion, pagos, auditoria y seguridad.{" "}
              {user.nombre || user.fullName || user.email} ·{" "}
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                {user.tipo_usuario}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Inicio
            </button>

            <button
              onClick={() => router.push("/aportar-historial")}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
            >
              Aportar historial
            </button>

            <button
              onClick={refreshAdminData}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className={classNames("h-4 w-4", refreshing && "animate-spin")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>

            <button
              onClick={() => logout("/login")}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-red-600"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {criticalWorkCount > 0 && (
          <ActionBanner
            tone="warning"
            title="Trabajo critico pendiente"
            description={`${criticalWorkCount.toLocaleString("es-CO")} tareas requieren revision operativa antes de cerrar el dia.`}
            action={
              <button
                type="button"
                onClick={() => setActiveTab(criticalQueues.find((queue) => queue.count > 0)?.target || "summary")}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-slate-800"
              >
                Atender cola
              </button>
            }
          />
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {operationalCards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => setActiveTab(card.target)}
              className="text-left transition hover:-translate-y-0.5"
            >
              <SystemMetricCard
                label={card.label}
                value={card.value.toLocaleString("es-CO")}
                description="Abrir cola operacional"
              />
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="px-2 pb-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Módulos
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Navegación operacional compacta.
              </p>
            </div>
          {adminTabs.map((tab) => {
            const queue = criticalQueues.find((item) => item.target === tab.key);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`mb-2 w-full rounded-2xl border p-3 text-left transition-colors ${
                  activeTab === tab.key
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block text-sm font-black">{tab.label}</span>
                    <span className={`mt-0.5 block text-xs ${activeTab === tab.key ? "text-slate-300" : "text-slate-500"}`}>
                      {queue?.owner || "Operacion"}
                    </span>
                  </span>
                  {queue ? (
                    <SystemStatusBadge tone={queue.count > 0 ? queue.tone : "success"}>
                      {queue.count.toLocaleString("es-CO")}
                    </SystemStatusBadge>
                  ) : activeTab === tab.key ? (
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
                  ) : null}
                </span>
              </button>
            );
          })}
          </aside>

          <div className="min-w-0">

        {activeTab === "summary" && (
          <>
        {metricsState.status !== "forbidden" && (
          <section className="mb-6">
            <SectionHeader
              eyebrow="Overview"
              title="Metricas comerciales"
              description="Resumen de uso, conversion e intencion de pago de los ultimos 7 dias."
            />
            <div className="hidden">
              <h2 className="text-lg font-semibold text-gray-800">
                Métricas comerciales
              </h2>
              <p className="text-sm text-gray-600">
                Resumen de uso, conversión e intención de pago de los últimos 7 días.
              </p>
            </div>

            {metricsState.status === "loading" || metricsState.status === "idle" ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
                Cargando métricas...
              </div>
            ) : metricsState.status === "error" ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
                No se pudieron cargar las métricas.
              </div>
            ) : commercialMetrics ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
                <MetricCard
                  label="Búsquedas hoy"
                  value={formatMetricNumber(commercialMetrics.searches_today)}
                />
                <MetricCard
                  label="Búsquedas 7 días"
                  value={formatMetricNumber(commercialMetrics.searches_7d)}
                />
                <MetricCard
                  label="Usuarios únicos 7 días"
                  value={formatMetricNumber(commercialMetrics.unique_search_users_7d)}
                />
                <MetricCard
                  label="Clicks upgrade"
                  value={formatMetricNumber(commercialMetrics.upgrade_clicks_7d)}
                />
                <MetricCard
                  label="Clicks Básico"
                  value={formatMetricNumber(commercialMetrics.basic_clicks_7d)}
                />
                <MetricCard
                  label="Clicks Pro"
                  value={formatMetricNumber(commercialMetrics.pro_clicks_7d)}
                />
                <MetricCard
                  label="Clicks Empresa"
                  value={formatMetricNumber(commercialMetrics.enterprise_clicks_7d)}
                />
                <MetricCard
                  label="Pagos creados"
                  value={formatMetricNumber(commercialMetrics.payments_created_7d)}
                />
                <MetricCard
                  label="Pagos pendientes"
                  value={formatMetricNumber(commercialMetrics.payments_pending_7d)}
                />
                <MetricCard
                  label="Pagos aprobados"
                  value={formatMetricNumber(commercialMetrics.payments_approved_7d)}
                />
                <MetricCard
                  label="Pagos fallidos"
                  value={formatMetricNumber(commercialMetrics.payments_failed_7d)}
                />
                <MetricCard
                  label="Usuarios por plan"
                  value={`Free: ${formatMetricNumber(
                    commercialMetrics.users_free
                  )} · Básico: ${formatMetricNumber(
                    commercialMetrics.users_basic
                  )} · Pro: ${formatMetricNumber(
                    commercialMetrics.users_pro
                  )} · Admin: ${formatMetricNumber(commercialMetrics.users_admin)}`}
                />
                <MetricCard
                  label="Conversión búsqueda → upgrade"
                  value={formatMetricPercentage(
                    commercialMetrics.conversion_search_to_upgrade_7d
                  )}
                />
                <MetricCard
                  label="Conversión upgrade → plan"
                  value={formatMetricPercentage(
                    commercialMetrics.conversion_upgrade_to_plan_click_7d
                  )}
                />
                <MetricCard
                  label="Aprobación de pagos"
                  value={formatMetricPercentage(commercialMetrics.payment_approval_rate_7d)}
                />
              </div>
            ) : null}
          </section>
        )}

        <section>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <StatCard label="Pendientes" value={reportStats.total} />
            <StatCard label="Impago" value={reportStats.impago} />
            <StatCard label="Daños" value={reportStats.danos} />
            <StatCard label="Desalojo" value={reportStats.desalojo} />
            <StatCard label="Ruido" value={reportStats.ruido} />
            <StatCard label="Otros" value={reportStats.otros} />
          </div>
        </section>
          </>
        )}

        {activeTab === "reports" && (
        <section>
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Buscar por nombre, cédula, ciudad, descripción o reportante
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ej: 12345678, Juan Pérez, Bogotá..."
                    className="w-full rounded-lg border px-3 py-2 pl-10 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>

              <div className="w-full lg:w-72">
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Filtrar por tipo
                </label>
                <select
                  value={problemFilter}
                  onChange={(e) => setProblemFilter(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">Todos los tipos</option>
                  <option value="impago">Mora / Impago</option>
                  <option value="danos">Daños al inmueble</option>
                  <option value="desalojo">Desalojo</option>
                  <option value="ruido">Ruido</option>
                  <option value="otros">Otros</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando <span className="font-semibold">{paginatedReports.length}</span>{" "}
                de <span className="font-semibold">{filteredReports.length}</span> reportes
                {filteredReports.length !== reports.length && ` (filtrados de ${reports.length})`}
              </span>

              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setProblemFilter("all");
                  }}
                  className="font-medium text-blue-600 hover:text-blue-800"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Reportes pendientes
            </h2>
            <p className="text-sm text-gray-600">
              Revisa cada reporte y decide si debe aprobarse o rechazarse.
            </p>
          </div>

          {reportsError && <ErrorAlert message={reportsError} onRetry={loadReports} />}

          {reportsLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : filteredReports.length === 0 ? (
            <EmptyState
              title={reports.length === 0 ? "Sin reportes pendientes" : "Sin resultados"}
              description={
                reports.length === 0
                  ? "No hay reportes pendientes en este momento."
                  : "Ningún reporte coincide con los filtros aplicados."
              }
            />
          ) : (
            <>
              <div className="space-y-3">
                {paginatedReports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    processingId={processingId || legalTraceSavingId}
                    onMarkInReview={() => openDecision(report.id, "mark_in_review")}
                    onRequestMoreInfo={() => openDecision(report.id, "request_more_info")}
                    onApprove={() => openDecision(report.id, "approve")}
                    onReject={() => openDecision(report.id, "reject")}
                    onBlockScoring={() => openDecision(report.id, "block_scoring")}
                    onNoticeAction={(action) => updateReportNotice(report.id, action)}
                    onEditLegalTrace={() => updateReportLegalTrace(report)}
                  />
                ))}
              </div>

              <Pagination
                currentPage={reportsPage}
                totalPages={reportsPageCount}
                onPageChange={setReportsPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "history" && (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Historial de decisiones
            </h2>
            <p className="text-sm text-gray-600">
              Registro de acciones administrativas sobre reportes e historiales arrendaticios.
            </p>
          </div>

          {actionsError && <ErrorAlert message={actionsError} onRetry={loadActions} />}

          {actionsLoadingState === "loading" ? (
            <LoadingSkeleton count={1} />
          ) : actions.length === 0 ? (
            <EmptyState
              title="Sin historial"
              description="Aún no se han registrado acciones administrativas."
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Acción
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Administrador
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Recurso
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 bg-white">
                    {actions.map((action) => (
                      <tr
                        key={action.id}
                        className="transition-colors hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-700">
                          {formatDate(action.timestamp || action.fecha_accion)}
                        </td>

                        <td className="px-3 py-2">
                          <ActionBadge action={action.action || action.accion} />
                        </td>

                        <td className="px-3 py-2 text-sm text-gray-700">
                          {action.admin ? (
                            <div className="space-y-0.5">
                              <p className="truncate font-medium text-gray-900">
                                {action.admin.nombre || "Sin nombre"}
                              </p>
                              <p className="truncate text-xs text-gray-500">{action.admin.email}</p>
                              <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                                {action.admin.tipo_usuario}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">No disponible</span>
                          )}
                        </td>

                        <td className="px-3 py-2 text-sm text-gray-700">
                          {action.report ? (
                            <div className="space-y-0.5">
                              <p className="truncate font-medium text-gray-900">
                                {action.resource_label ||
                                  formatProblemLabel(action.report.tipo_problema)}
                              </p>
                              <p className="line-clamp-2 overflow-hidden text-sm text-gray-500">
                                {truncateText(
                                  action.resource_summary || action.report.descripcion,
                                  100
                                )}
                              </p>
                              <span className="block truncate text-xs text-gray-400">
                                ID: {action.report.id}
                              </span>
                            </div>
                          ) : action.rental_history ? (
                            <div className="space-y-0.5">
                              <p className="truncate font-medium text-gray-900">
                                {action.resource_label || "Historial arrendaticio"}
                              </p>
                              <p className="line-clamp-2 overflow-hidden text-sm text-gray-500">
                                {action.resource_summary || [
                                  action.rental_history.lessor_name,
                                  action.rental_history.city,
                                  action.rental_history.property_type,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Sin detalle adicional"}
                              </p>
                              <span className="block truncate text-xs text-gray-400">
                                ID: {action.rental_history.id} · Doc:{" "}
                                {action.rental_history.cedula_inquilino}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">No disponible</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        )}

        {activeTab === "rentalHistory" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Historial arrendaticio
              </h2>
              <p className="text-sm text-gray-600">
                Revisión administrativa de historiales estructurados enviados por usuarios.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {rentalHistories.length.toLocaleString("es-CO")} registros
            </span>
          </div>

          {rentalHistoriesError && (
            <ErrorAlert message={rentalHistoriesError} onRetry={loadRentalHistories} />
          )}

          {rentalHistoriesNotice && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {rentalHistoriesNotice}
            </div>
          )}

          {rentalHistoriesLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : rentalHistories.length === 0 ? (
            <EmptyState
              title="Sin historiales arrendaticios"
              description="No hay historiales enviados para revisión administrativa."
            />
          ) : (
            <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {rentalHistories.map((history) => (
                <article
                  key={history.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <RentalHistoryStatusBadge status={history.status} />
                        <span className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                          Documento {history.subject_document_type || "CC"}{" "}
                          {history.subject_document_number || history.cedula_inquilino}
                        </span>
                        <span className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                          {formatRentalHistorySourceType(history.source_type)}
                        </span>
                        <span className="rounded-full border bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                          {history.visibility_level}
                        </span>
                      </div>

                      <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <InfoBox
                          label="Tipo sujeto"
                          value={formatRentalHistorySubjectType(history.subject_type)}
                        />
                        <InfoBox
                          label="Tipo documento"
                          value={history.subject_document_type || "CC"}
                        />
                        <InfoBox
                          label="Numero documento"
                          value={history.subject_document_number || history.cedula_inquilino}
                        />
                        <InfoBox
                          label="Origen"
                          value={formatRentalHistorySourceType(history.source_type)}
                        />
                        <InfoBox label="Ciudad" value={history.city || "No disponible"} />
                        <InfoBox
                          label="Tipo inmueble"
                          value={history.property_type || "No disponible"}
                        />
                        <InfoBox
                          label="Contrato"
                          value={`${formatDate(history.contract_start_date)} - ${formatDate(
                            history.contract_end_date
                          )}`}
                        />
                        <InfoBox
                          label="Canon mensual"
                          value={formatNullableCOP(
                            history.monthly_rent_amount,
                            history.currency
                          )}
                        />
                        <InfoBox
                          label="Mora"
                          value={`${formatBooleanValue(history.had_late_payments)}${
                            history.late_payment_months
                              ? ` (${history.late_payment_months} meses)`
                              : ""
                          }`}
                        />
                        <InfoBox
                          label="Daños"
                          value={formatBooleanValue(history.had_property_damage)}
                        />
                        <InfoBox
                          label="Entrega formal"
                          value={formatBooleanValue(history.formal_handover)}
                        />
                        <InfoBox
                          label="Deuda entrega"
                          value={
                            history.had_debt_at_handover
                              ? `Si ${formatNullableCOP(history.debt_amount, history.currency)}`
                              : formatBooleanValue(history.had_debt_at_handover)
                          }
                        />
                        <InfoBox
                          label="Soporte documental"
                          value={formatBooleanValue(history.has_supporting_documents)}
                        />
                        <InfoBox
                          label="Impacto score"
                          value={history.score_impact_enabled ? "Activo" : "Inactivo"}
                        />
                        <InfoBox
                          label="Consentimiento"
                          value={history.tenant_consent_status}
                        />
                        <InfoBox label="Creado" value={formatDate(history.created_at)} />
                      </div>

                      {(history.property_damage_notes ||
                        history.verification_notes ||
                        history.rejection_reason ||
                        history.dispute_notes) && (
                        <div className="mt-3 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                          {history.property_damage_notes && (
                            <p>
                              <span className="font-semibold">Notas daños:</span>{" "}
                              {truncateText(history.property_damage_notes, 180)}
                            </p>
                          )}
                          {history.verification_notes && (
                            <p>
                              <span className="font-semibold">Verificación:</span>{" "}
                              {truncateText(history.verification_notes, 180)}
                            </p>
                          )}
                          {history.rejection_reason && (
                            <p>
                              <span className="font-semibold">Rechazo:</span>{" "}
                              {truncateText(history.rejection_reason, 180)}
                            </p>
                          )}
                          {history.dispute_notes && (
                            <p>
                              <span className="font-semibold">Disputa:</span>{" "}
                              {truncateText(history.dispute_notes, 180)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:w-36 lg:flex-col">
                      <button
                        type="button"
                        onClick={() => updateRentalHistoryStatus(history.id, "verified")}
                        disabled={rentalHistoryActionId === history.id}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Verificar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRentalHistoryStatus(history.id, "rejected")}
                        disabled={rentalHistoryActionId === history.id}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRentalHistoryStatus(history.id, "disputed")}
                        disabled={rentalHistoryActionId === history.id}
                        className="rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Disputar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        )}

        {activeTab === "users" && (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Usuarios y planes
            </h2>
            <p className="text-sm text-gray-600">
              Gestión manual de planes sin activar pagos ni modificar permisos.
            </p>
          </div>

          {usersError && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {usersError}
            </div>
          )}

          {usersLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : users.length === 0 ? (
            <EmptyState
              title="Sin usuarios para mostrar"
              description="No hay usuarios disponibles o no tienes acceso a esta sección."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Tipo
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Plan
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Límite
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Acción
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100 bg-white">
                    {users.map((adminUser) => (
                      <tr key={adminUser.id} className="hover:bg-gray-50">
                        <td className="max-w-[260px] px-3 py-2 text-gray-900">
                          <p className="truncate font-medium">{adminUser.email}</p>
                          <p className="truncate text-xs text-gray-400">{adminUser.id}</p>
                        </td>

                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {adminUser.tipo_usuario || "N/D"}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <select
                            value={adminUser.plan_type || "free"}
                            onChange={(event) =>
                              handleUserPlanChange(
                                adminUser.id,
                                event.target.value as AdminPlanType
                              )
                            }
                            className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          >
                            {PLAN_OPTIONS.map((plan) => (
                              <option key={plan} value={plan}>
                                {plan}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                          {adminUser.daily_search_limit === null
                            ? "∞"
                            : adminUser.daily_search_limit}
                        </td>

                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => saveUserPlan(adminUser)}
                            disabled={savingId === adminUser.id}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingId === adminUser.id ? "Guardando..." : "Guardar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">
                  Historial de cambios de plan
                </h3>
                <p className="text-sm text-gray-500">
                  Auditoría operacional de cambios manuales, webhook Wompi y reconciliaciones.
                </p>
              </div>
              <span className="text-xs text-gray-400">
                {planChangeLogsPagination.total.toLocaleString("es-CO")} registros
              </span>
            </div>

            <form
              className="mb-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
              onSubmit={(event) => {
                event.preventDefault();
                applyPlanChangeLogFilters();
              }}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input
                  value={planChangeLogDraftFilters.user_email}
                  onChange={(event) =>
                    setPlanChangeLogDraftFilters((current) => ({
                      ...current,
                      user_email: event.target.value,
                    }))
                  }
                  placeholder="Email usuario afectado"
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={planChangeLogDraftFilters.reason}
                  onChange={(event) =>
                    setPlanChangeLogDraftFilters((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Razón"
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={planChangeLogDraftFilters.previous_plan}
                  onChange={(event) =>
                    setPlanChangeLogDraftFilters((current) => ({
                      ...current,
                      previous_plan: event.target.value,
                    }))
                  }
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Plan anterior</option>
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
                <select
                  value={planChangeLogDraftFilters.new_plan}
                  onChange={(event) =>
                    setPlanChangeLogDraftFilters((current) => ({
                      ...current,
                      new_plan: event.target.value,
                    }))
                  }
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Plan nuevo</option>
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Filtrar
                  </button>
                  <button
                    type="button"
                    onClick={resetPlanChangeLogFilters}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </form>

            {planLogsError && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {planLogsError}
              </div>
            )}

            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              {planLogsLoadingState === "loading" ? (
                <div className="p-4">
                  <LoadingSkeleton count={1} />
                </div>
              ) : planChangeLogs.length === 0 ? (
                <p className="px-4 py-5 text-sm text-gray-500">
                  Sin cambios de plan registrados
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Fecha
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Usuario objetivo
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Plan / Límite
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Actor
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Razón
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Pago
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 bg-white">
                      {planChangeLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                            {formatDate(log.created_at)}
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-gray-700">
                            <p className="truncate font-medium text-gray-900">
                              {log.target_user?.email || "Email no disponible"}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {log.target_user_id || "No disponible"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-900">
                            <p>
                              <span className="font-medium">
                                {log.previous_plan_type || "N/D"}
                              </span>{" "}
                              &rarr;{" "}
                              <span className="font-semibold">{log.new_plan_type}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatLimit(log.previous_daily_search_limit)} &rarr;{" "}
                              {formatLimit(log.new_daily_search_limit)}
                            </p>
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-gray-700">
                            <p className="truncate font-medium text-gray-900">
                              {log.admin_user?.email || (log.admin_user_id ? "Admin" : "Sistema")}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {log.admin_user_id || "system"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                            {formatPlanChangeReason(log.reason)}
                          </td>
                          <td className="max-w-[260px] px-3 py-2 text-gray-700">
                            {log.payment_reference ? (
                              <>
                                <p className="truncate font-mono text-xs text-gray-800">
                                  {log.payment_reference}
                                </p>
                                <p className="truncate text-xs text-gray-500">
                                  {log.payment_provider || "provider N/D"} · {log.payment_id}
                                </p>
                              </>
                            ) : (
                              <span className="text-gray-400">No aplica</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <Pagination
              currentPage={planChangeLogsPagination.page}
              totalPages={Math.max(1, planChangeLogsPagination.totalPages)}
              onPageChange={setPlanChangeLogsPage}
            />
          </div>
        </section>
        )}

        {activeTab === "payments" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Pagos Wompi
              </h2>
              <p className="text-sm text-gray-600">
                Historial operacional para conciliación, soporte y auditoría de activaciones.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {wompiPaymentsPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <form
            className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              applyWompiPaymentFilters();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Estado
                </label>
                <select
                  value={wompiPaymentDraftFilters.status}
                  onChange={(event) =>
                    setWompiPaymentDraftFilters((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {WOMPI_PAYMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Plan
                </label>
                <select
                  value={wompiPaymentDraftFilters.plan_type}
                  onChange={(event) =>
                    setWompiPaymentDraftFilters((current) => ({
                      ...current,
                      plan_type: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Reference
                </label>
                <input
                  value={wompiPaymentDraftFilters.reference}
                  onChange={(event) =>
                    setWompiPaymentDraftFilters((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  placeholder="inmoscore_pro..."
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Email usuario
                </label>
                <input
                  type="email"
                  value={wompiPaymentDraftFilters.user_email}
                  onChange={(event) =>
                    setWompiPaymentDraftFilters((current) => ({
                      ...current,
                      user_email: event.target.value,
                    }))
                  }
                  placeholder="cliente@dominio.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={resetWompiPaymentFilters}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>

          {wompiPaymentsError && (
            <ErrorAlert message={wompiPaymentsError} onRetry={loadWompiPayments} />
          )}

          {wompiPaymentsLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : wompiPayments.length === 0 ? (
            <EmptyState
              title="Sin pagos Wompi"
              description="No hay pagos que coincidan con los filtros aplicados."
            />
          ) : (
            <>
              <DataTableShell
                title="Pagos para conciliacion"
                description="Transacciones Wompi, verificacion de consistencia y acciones operativas."
              >
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Usuario
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Plan / Valor
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Reference
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado interno
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado Wompi
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Transaction ID
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Fechas
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Acción
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 bg-white">
                      {wompiPayments.map((payment) => {
                        const verifyState = wompiVerifyResults[payment.payment_id];
                        const reconcileState = wompiReconcileResults[payment.payment_id];
                        const canReconcile =
                          Boolean(payment.wompi_transaction_id) &&
                          (payment.internal_status !== "approved" || !payment.processed_at);

                        return (
                        <Fragment key={payment.payment_id}>
                        <tr className="hover:bg-gray-50">
                          <td className="max-w-[240px] px-3 py-2">
                            <p className="truncate font-medium text-gray-900">
                              {payment.user_email || "Email no disponible"}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {payment.user_id || "Usuario no disponible"}
                            </p>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2">
                            <p className="font-semibold text-gray-900">
                              {payment.plan_type}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatCOP(payment.amount_in_cents, payment.currency)}
                            </p>
                          </td>

                          <td className="max-w-[260px] px-3 py-2">
                            <p className="truncate font-mono text-xs text-gray-800">
                              {payment.reference}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {payment.payment_id}
                            </p>
                          </td>

                          <td className="px-3 py-2">
                            <WompiPaymentStatusBadge status={payment.internal_status} />
                          </td>

                          <td className="px-3 py-2">
                            <WompiPaymentStatusBadge status={payment.wompi_status} />
                          </td>

                          <td className="max-w-[220px] px-3 py-2">
                            <span className="block truncate font-mono text-xs text-gray-700">
                              {payment.wompi_transaction_id || "No registrado"}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                            <p>
                              <span className="font-medium text-gray-700">Creado:</span>{" "}
                              {formatDate(payment.created_at)}
                            </p>
                            <p>
                              <span className="font-medium text-gray-700">Procesado:</span>{" "}
                              {formatDate(payment.processed_at)}
                            </p>
                          </td>

                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => verifyWompiPayment(payment.payment_id)}
                                disabled={verifyingPaymentId === payment.payment_id}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {verifyingPaymentId === payment.payment_id
                                  ? "Verificando..."
                                  : "Verificar en Wompi"}
                              </button>

                              {canReconcile ? (
                                <button
                                  type="button"
                                  onClick={() => reconcileWompiPayment(payment.payment_id)}
                                  disabled={reconcilingPaymentId === payment.payment_id}
                                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {reconcilingPaymentId === payment.payment_id
                                    ? "Reconciliando..."
                                    : "Reconciliar"}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">
                                  Sin reconciliación pendiente
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {(verifyState || reconcileState) && (
                          <tr key={`${payment.payment_id}-ops`}>
                            <td colSpan={8} className="bg-gray-50 px-3 py-3">
                              <div className="space-y-3">
                                {verifyState && (
                                  verifyState.status === "error" ? (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                      {verifyState.message}
                                    </div>
                                  ) : (
                                    <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                                      <InfoBox
                                        label="Estado actual Wompi"
                                        value={verifyState.data.wompi_status_current}
                                      />
                                      <InfoBox
                                        label="Transaction ID coincide"
                                        value={
                                          verifyState.data.consistency_checks.transaction_id_matches
                                            ? "Si"
                                            : "No"
                                        }
                                      />
                                      <InfoBox
                                        label="Reference coincide"
                                        value={
                                          verifyState.data.consistency_checks.reference_matches
                                            ? "Si"
                                            : "No"
                                        }
                                      />
                                      <InfoBox
                                        label="Finalizado"
                                        value={formatDate(verifyState.data.finalized_at)}
                                      />
                                    </div>
                                  )
                                )}

                                {reconcileState && (
                                  reconcileState.status === "error" ? (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                      <p className="font-semibold">No se puede reconciliar</p>
                                      <p>{reconcileState.message}</p>
                                      {reconcileState.data?.failed_checks && (
                                        <p className="mt-1 text-xs">
                                          Checks fallidos:{" "}
                                          {formatFailedChecks(reconcileState.data.failed_checks)}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                                      <InfoBox
                                        label="Reconciliación"
                                        value={
                                          reconcileState.data.already_processed
                                            ? "Ya estaba procesado"
                                            : "Reconciliado exitosamente"
                                        }
                                      />
                                      <InfoBox
                                        label="Plan activado"
                                        value={reconcileState.data.plan_type || "No disponible"}
                                      />
                                      <InfoBox
                                        label="Estado Wompi"
                                        value={reconcileState.data.wompi_status || "APPROVED"}
                                      />
                                      <InfoBox
                                        label="Auditoría"
                                        value={
                                          reconcileState.data.audit_logged
                                            ? "Registrada"
                                            : "No registrada"
                                        }
                                      />
                                    </div>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                      })}
                    </tbody>
                  </table>
              </DataTableShell>

              <Pagination
                currentPage={wompiPaymentsPagination.page}
                totalPages={Math.max(1, wompiPaymentsPagination.totalPages)}
                onPageChange={setWompiPaymentsPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "disputes" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Disputas operativas
              </h2>
              <p className="text-sm text-gray-600">
                Gestiona controversias sobre reportes, senales judiciales y datos que pueden afectar el score.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {dataDisputesPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <form
            className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              applyDataDisputeFilters();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Estado
                </label>
                <select
                  value={dataDisputeDraftFilters.status}
                  onChange={(event) =>
                    setDataDisputeDraftFilters((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {DATA_DISPUTE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatDataDisputeStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Objetivo
                </label>
                <select
                  value={dataDisputeDraftFilters.target_type}
                  onChange={(event) =>
                    setDataDisputeDraftFilters((current) => ({
                      ...current,
                      target_type: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {DATA_DISPUTE_TARGET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatDataDisputeTargetType(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Tipo
                </label>
                <select
                  value={dataDisputeDraftFilters.dispute_type}
                  onChange={(event) =>
                    setDataDisputeDraftFilters((current) => ({
                      ...current,
                      dispute_type: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {DATA_DISPUTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatDataDisputeType(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Email
                </label>
                <input
                  type="email"
                  value={dataDisputeDraftFilters.requester_email}
                  onChange={(event) =>
                    setDataDisputeDraftFilters((current) => ({
                      ...current,
                      requester_email: event.target.value,
                    }))
                  }
                  placeholder="titular@dominio.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Documento
                </label>
                <input
                  type="text"
                  value={dataDisputeDraftFilters.requester_document_id}
                  onChange={(event) =>
                    setDataDisputeDraftFilters((current) => ({
                      ...current,
                      requester_document_id: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={resetDataDisputeFilters}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>

          {dataDisputesError && (
            <ErrorAlert message={dataDisputesError} onRetry={loadDataDisputes} />
          )}

          {dataDisputesLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : dataDisputes.length === 0 ? (
            <EmptyState
              title="Sin disputas"
              description="No hay disputas que coincidan con los filtros."
            />
          ) : (
            <>
              <DataTableShell
                title="Disputas operativas"
                description="Solicitudes abiertas, vencimientos, gestion y estado legal."
              >
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {[
                          "Solicitante",
                          "Objetivo",
                          "Tipo",
                          "Fechas",
                          "Descripcion",
                          "Gestion",
                          "Estado",
                        ].map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {dataDisputes.map((dispute) => (
                        <tr key={dispute.id} className="hover:bg-gray-50">
                          <td className="max-w-[240px] px-3 py-2 text-gray-700">
                            <p className="truncate font-medium text-gray-900">
                              {dispute.requester_name || "Nombre no informado"}
                            </p>
                            <p className="truncate text-xs">{dispute.requester_email}</p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {dispute.requester_document_id || "Sin documento"}
                            </p>
                          </td>
                          <td className="max-w-[240px] px-3 py-2 text-gray-700">
                            <p className="font-semibold text-gray-900">
                              {formatDataDisputeTargetType(dispute.target_type)}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-500">
                              {dispute.target_id || dispute.target_reference || "Sin referencia"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                            {formatDataDisputeType(dispute.dispute_type)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                            <p>
                              <span className="font-medium text-gray-700">Radicacion:</span>{" "}
                              {formatDate(dispute.submitted_at)}
                            </p>
                            <p>
                              <span className="font-medium text-gray-700">Vence:</span>{" "}
                              {formatDate(dispute.due_at)}
                            </p>
                            {dispute.resolved_at && (
                              <p>
                                <span className="font-medium text-gray-700">Cierre:</span>{" "}
                                {formatDate(dispute.resolved_at)}
                              </p>
                            )}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-gray-700">
                            <p className="line-clamp-3 overflow-hidden">{dispute.description}</p>
                            {dispute.evidence_url && (
                              <a
                                href={dispute.evidence_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-xs font-medium text-blue-700 hover:underline"
                              >
                                Evidencia
                              </a>
                            )}
                          </td>
                          <td className="max-w-[280px] px-3 py-2">
                            <p className="line-clamp-2 overflow-hidden text-xs text-gray-700">
                              <span className="font-medium">Notas:</span>{" "}
                              {dispute.admin_notes || "Sin notas"}
                            </p>
                            <p className="mt-1 line-clamp-2 overflow-hidden text-xs text-gray-700">
                              <span className="font-medium">Resolucion:</span>{" "}
                              {dispute.resolution_summary || "Sin resolucion"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const notes = window.prompt(
                                    "Notas administrativas de la disputa:",
                                    dispute.admin_notes || ""
                                  );
                                  if (notes !== null) {
                                    updateDataDispute(dispute.id, { admin_notes: notes });
                                  }
                                }}
                                disabled={savingDataDisputeId === dispute.id}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Notas
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const summary = window.prompt(
                                    "Resumen de resolucion:",
                                    dispute.resolution_summary || ""
                                  );
                                  if (summary !== null) {
                                    updateDataDispute(dispute.id, {
                                      resolution_summary: summary,
                                    });
                                  }
                                }}
                                disabled={savingDataDisputeId === dispute.id}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Resolucion
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <select
                              value={dispute.status}
                              onChange={(event) =>
                                updateDataDispute(dispute.id, {
                                  status: event.target.value as DataDisputeStatus,
                                })
                              }
                              disabled={savingDataDisputeId === dispute.id}
                              className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              {DATA_DISPUTE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatDataDisputeStatus(status)}
                                </option>
                              ))}
                            </select>
                            <p className="mt-2 text-xs text-gray-500">
                              {savingDataDisputeId === dispute.id
                                ? "Guardando..."
                                : formatDataDisputeStatus(dispute.status)}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </DataTableShell>

              <Pagination
                currentPage={dataDisputesPagination.page}
                totalPages={Math.max(1, dataDisputesPagination.totalPages)}
                onPageChange={setDataDisputesPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "dataRequests" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Solicitudes de datos personales
              </h2>
              <p className="text-sm text-gray-600">
                Gestión operativa básica de solicitudes de titulares. No ejecuta borrados ni cambios automáticos.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {dataRequestsPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <form
            className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              applyDataRequestFilters();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Estado
                </label>
                <select
                  value={dataRequestDraftFilters.status}
                  onChange={(event) =>
                    setDataRequestDraftFilters((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {DATA_REQUEST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatDataRequestStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Tipo
                </label>
                <select
                  value={dataRequestDraftFilters.request_type}
                  onChange={(event) =>
                    setDataRequestDraftFilters((current) => ({
                      ...current,
                      request_type: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {DATA_REQUEST_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatDataRequestType(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Email solicitante
                </label>
                <input
                  type="email"
                  value={dataRequestDraftFilters.requester_email}
                  onChange={(event) =>
                    setDataRequestDraftFilters((current) => ({
                      ...current,
                      requester_email: event.target.value,
                    }))
                  }
                  placeholder="titular@dominio.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={resetDataRequestFilters}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>

          {dataRequestsError && (
            <ErrorAlert message={dataRequestsError} onRetry={loadDataRequests} />
          )}

          {dataRequestsLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : dataRequests.length === 0 ? (
            <EmptyState
              title="Sin solicitudes"
              description="No hay solicitudes de datos personales que coincidan con los filtros."
            />
          ) : (
            <>
              <DataTableShell
                title="Solicitudes de datos"
                description="Derechos de titulares, vencimientos, notas y resolucion."
              >
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Solicitud
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Solicitante
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Fechas
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Descripción
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Notas admin
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 bg-white">
                      {dataRequests.map((request) => (
                        <tr key={request.id} className="hover:bg-gray-50">
                          <td className="max-w-[220px] px-3 py-2">
                            <p className="font-semibold text-gray-900">
                              {formatDataRequestType(request.request_type)}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {request.id}
                            </p>
                          </td>
                          <td className="max-w-[240px] px-3 py-2 text-gray-700">
                            <p className="truncate font-medium text-gray-900">
                              {request.requester_name || "Nombre no informado"}
                            </p>
                            <p className="truncate text-xs">{request.requester_email}</p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {request.user_id || "Sin usuario autenticado"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                            <p>
                              <span className="font-medium text-gray-700">Radicación:</span>{" "}
                              {formatDate(request.submitted_at)}
                            </p>
                            <p>
                              <span className="font-medium text-gray-700">Vence:</span>{" "}
                              {formatDate(request.due_at)}
                            </p>
                            {request.resolved_at && (
                              <p>
                                <span className="font-medium text-gray-700">Cierre:</span>{" "}
                                {formatDate(request.resolved_at)}
                              </p>
                            )}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-gray-700">
                            <p className="line-clamp-3 overflow-hidden">
                              {request.description}
                            </p>
                          </td>
                          <td className="max-w-[280px] px-3 py-2">
                            <p className="line-clamp-3 overflow-hidden text-gray-700">
                              {request.admin_notes || "Sin notas"}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const notes = window.prompt(
                                  "Notas administrativas de la solicitud:",
                                  request.admin_notes || ""
                                );
                                if (notes !== null) {
                                  updateDataRequest(request.id, { admin_notes: notes });
                                }
                              }}
                              disabled={savingDataRequestId === request.id}
                              className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Editar notas
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <select
                              value={request.status}
                              onChange={(event) =>
                                updateDataRequest(request.id, {
                                  status: event.target.value as DataSubjectRequestStatus,
                                })
                              }
                              disabled={savingDataRequestId === request.id}
                              className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              {DATA_REQUEST_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatDataRequestStatus(status)}
                                </option>
                              ))}
                            </select>
                            <p className="mt-2 text-xs text-gray-500">
                              {savingDataRequestId === request.id
                                ? "Guardando..."
                                : formatDataRequestStatus(request.status)}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </DataTableShell>

              <Pagination
                currentPage={dataRequestsPagination.page}
                totalPages={Math.max(1, dataRequestsPagination.totalPages)}
                onPageChange={setDataRequestsPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "humanReview" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Revisión humana
              </h2>
              <p className="text-sm text-gray-600">
                Solicitudes de titulares sobre resultados automatizados. Esta vista no recalcula ni modifica scores.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {humanReviewRequestsPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <form
            className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              applyHumanReviewFilters();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Estado
                </label>
                <select
                  value={humanReviewDraftFilters.status}
                  onChange={(event) =>
                    setHumanReviewDraftFilters((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {HUMAN_REVIEW_REQUEST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatHumanReviewStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Motivo
                </label>
                <select
                  value={humanReviewDraftFilters.reason}
                  onChange={(event) =>
                    setHumanReviewDraftFilters((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {HUMAN_REVIEW_REQUEST_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {formatHumanReviewReason(reason)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Email
                </label>
                <input
                  type="email"
                  value={humanReviewDraftFilters.requester_email}
                  onChange={(event) =>
                    setHumanReviewDraftFilters((current) => ({
                      ...current,
                      requester_email: event.target.value,
                    }))
                  }
                  placeholder="titular@dominio.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Documento
                </label>
                <input
                  value={humanReviewDraftFilters.requester_document_id}
                  onChange={(event) =>
                    setHumanReviewDraftFilters((current) => ({
                      ...current,
                      requester_document_id: event.target.value,
                    }))
                  }
                  placeholder="Documento"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={resetHumanReviewFilters}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>

          {humanReviewRequestsError && (
            <ErrorAlert message={humanReviewRequestsError} onRetry={loadHumanReviewRequests} />
          )}

          {humanReviewRequestsLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : humanReviewRequests.length === 0 ? (
            <EmptyState
              title="Sin solicitudes"
              description="No hay solicitudes de revision humana que coincidan con los filtros."
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Solicitud
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Solicitante
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Resultado
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Descripcion
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Gestion
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 bg-white">
                      {humanReviewRequests.map((request) => (
                        <tr key={request.id} className="hover:bg-gray-50">
                          <td className="max-w-[230px] px-3 py-2">
                            <p className="font-semibold text-gray-900">
                              {formatHumanReviewReason(request.reason)}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {request.id}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {formatDate(request.created_at)}
                            </p>
                          </td>
                          <td className="max-w-[240px] px-3 py-2 text-gray-700">
                            <p className="truncate font-medium text-gray-900">
                              {request.requester_name || "Nombre no informado"}
                            </p>
                            <p className="truncate text-xs">{request.requester_email}</p>
                            <p className="truncate text-xs text-gray-500">
                              Doc: {request.requester_document_id || "N/D"}
                            </p>
                            <p className="truncate font-mono text-xs text-gray-400">
                              {request.user_id || "Sin usuario autenticado"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                            <p>
                              <span className="font-medium text-gray-700">Cedula:</span>{" "}
                              {request.cedula_consultada || "N/D"}
                            </p>
                            <p>
                              <span className="font-medium text-gray-700">Score:</span>{" "}
                              {request.current_score ?? "N/D"}
                            </p>
                            <p>
                              <span className="font-medium text-gray-700">Clasificacion:</span>{" "}
                              {request.current_classification || "N/D"}
                            </p>
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-gray-700">
                            <p className="line-clamp-4 overflow-hidden">
                              {request.description}
                            </p>
                          </td>
                          <td className="max-w-[280px] px-3 py-2">
                            <p className="line-clamp-2 overflow-hidden text-gray-700">
                              <span className="font-semibold">Notas:</span>{" "}
                              {request.admin_notes || "Sin notas"}
                            </p>
                            <p className="mt-2 line-clamp-2 overflow-hidden text-gray-700">
                              <span className="font-semibold">Resumen:</span>{" "}
                              {request.review_summary || "Sin resumen"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const notes = window.prompt(
                                    "Notas administrativas:",
                                    request.admin_notes || ""
                                  );
                                  if (notes !== null) {
                                    updateHumanReviewRequest(request.id, { admin_notes: notes });
                                  }
                                }}
                                disabled={savingHumanReviewRequestId === request.id}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Notas
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const summary = window.prompt(
                                    "Resumen de revision:",
                                    request.review_summary || ""
                                  );
                                  if (summary !== null) {
                                    updateHumanReviewRequest(request.id, { review_summary: summary });
                                  }
                                }}
                                disabled={savingHumanReviewRequestId === request.id}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Resumen
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <select
                              value={request.status}
                              onChange={(event) =>
                                updateHumanReviewRequest(request.id, {
                                  status: event.target.value as HumanReviewRequestStatus,
                                })
                              }
                              disabled={savingHumanReviewRequestId === request.id}
                              className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              {HUMAN_REVIEW_REQUEST_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatHumanReviewStatus(status)}
                                </option>
                              ))}
                            </select>
                            <p className="mt-2 text-xs text-gray-500">
                              {savingHumanReviewRequestId === request.id
                                ? "Guardando..."
                                : formatHumanReviewStatus(request.status)}
                            </p>
                            {request.resolved_at && (
                              <p className="mt-1 text-xs text-gray-500">
                                Cierre: {formatDate(request.resolved_at)}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination
                currentPage={humanReviewRequestsPagination.page}
                totalPages={Math.max(1, humanReviewRequestsPagination.totalPages)}
                onPageChange={setHumanReviewRequestsPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "dataInventory" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Inventario de datos personales
              </h2>
              <p className="text-sm text-gray-600">
                Catálogo administrativo para RNBD, retención, origen del dato y base legal.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {dataInventoryPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <form
            className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              applyDataInventoryFilters();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Dominio
                </label>
                <select
                  value={dataInventoryDraftFilters.data_domain}
                  onChange={(event) =>
                    setDataInventoryDraftFilters((current) => ({
                      ...current,
                      data_domain: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {DATA_INVENTORY_DOMAINS.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Categoría
                </label>
                <select
                  value={dataInventoryDraftFilters.data_category}
                  onChange={(event) =>
                    setDataInventoryDraftFilters((current) => ({
                      ...current,
                      data_category: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  {DATA_INVENTORY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Sensibilidad
                </label>
                <select
                  value={dataInventoryDraftFilters.sensitivity_level}
                  onChange={(event) =>
                    setDataInventoryDraftFilters((current) => ({
                      ...current,
                      sensitivity_level: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  {DATA_INVENTORY_SENSITIVITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Base legal
                </label>
                <select
                  value={dataInventoryDraftFilters.legal_basis}
                  onChange={(event) =>
                    setDataInventoryDraftFilters((current) => ({
                      ...current,
                      legal_basis: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  {DATA_INVENTORY_LEGAL_BASES.map((basis) => (
                    <option key={basis} value={basis}>
                      {basis}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Impacta score
                </label>
                <select
                  value={dataInventoryDraftFilters.impacts_scoring}
                  onChange={(event) =>
                    setDataInventoryDraftFilters((current) => ({
                      ...current,
                      impacts_scoring: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  Activo
                </label>
                <select
                  value={dataInventoryDraftFilters.is_active}
                  onChange={(event) =>
                    setDataInventoryDraftFilters((current) => ({
                      ...current,
                      is_active: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={resetDataInventoryFilters}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </form>

          <form
            className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={saveDataInventoryItem}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {editingDataInventoryId ? "Editar item" : "Crear item"}
              </h3>
              {editingDataInventoryId && (
                <button
                  type="button"
                  onClick={resetDataInventoryForm}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select
                value={dataInventoryForm.data_domain}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    data_domain: event.target.value as DataInventoryDomain,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {DATA_INVENTORY_DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>

              <input
                value={dataInventoryForm.field_name}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    field_name: event.target.value,
                  }))
                }
                placeholder="tabla.campo"
                required
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />

              <select
                value={dataInventoryForm.data_category}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    data_category: event.target.value as DataInventoryCategory,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {DATA_INVENTORY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                value={dataInventoryForm.sensitivity_level}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    sensitivity_level: event.target.value as DataInventorySensitivity,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {DATA_INVENTORY_SENSITIVITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>

              <select
                value={dataInventoryForm.source_type}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    source_type: event.target.value as DataInventorySourceType,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {DATA_INVENTORY_SOURCE_TYPES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>

              <select
                value={dataInventoryForm.legal_basis}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    legal_basis: event.target.value as DataInventoryLegalBasis,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {DATA_INVENTORY_LEGAL_BASES.map((basis) => (
                  <option key={basis} value={basis}>
                    {basis}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                value={dataInventoryForm.retention_days}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    retention_days: event.target.value,
                  }))
                }
                placeholder="Días retención (opcional)"
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />

              <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dataInventoryForm.impacts_scoring}
                    onChange={(event) =>
                      setDataInventoryForm((current) => ({
                        ...current,
                        impacts_scoring: event.target.checked,
                      }))
                    }
                  />
                  Score
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dataInventoryForm.requires_consent}
                    onChange={(event) =>
                      setDataInventoryForm((current) => ({
                        ...current,
                        requires_consent: event.target.checked,
                      }))
                    }
                  />
                  Consent.
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dataInventoryForm.is_public_source}
                    onChange={(event) =>
                      setDataInventoryForm((current) => ({
                        ...current,
                        is_public_source: event.target.checked,
                      }))
                    }
                  />
                  Pública
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dataInventoryForm.is_active}
                    onChange={(event) =>
                      setDataInventoryForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Activo
                </label>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <textarea
                value={dataInventoryForm.description}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Descripción"
                required
                rows={3}
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <textarea
                value={dataInventoryForm.purpose}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    purpose: event.target.value,
                  }))
                }
                placeholder="Finalidad"
                required
                rows={3}
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <textarea
                value={dataInventoryForm.retention_policy}
                onChange={(event) =>
                  setDataInventoryForm((current) => ({
                    ...current,
                    retention_policy: event.target.value,
                  }))
                }
                placeholder="Política de retención"
                required
                rows={3}
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="mt-3">
              <button
                type="submit"
                disabled={Boolean(savingDataInventoryId)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingDataInventoryId ? "Guardando..." : "Guardar item"}
              </button>
            </div>
          </form>

          {dataInventoryError && (
            <ErrorAlert message={dataInventoryError} onRetry={loadDataInventory} />
          )}

          {dataInventoryLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : dataInventoryItems.length === 0 ? (
            <EmptyState
              title="Sin inventario"
              description="No hay items que coincidan con los filtros."
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {[
                          "Dato",
                          "Clasificación",
                          "Base",
                          "Finalidad",
                          "Retención",
                          "Flags",
                          "Acciones",
                        ].map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {dataInventoryItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="max-w-[260px] px-3 py-2">
                            <p className="font-semibold text-gray-900">{item.data_domain}</p>
                            <p className="break-words font-mono text-xs text-gray-600">
                              {item.field_name}
                            </p>
                            <p className="mt-1 line-clamp-2 overflow-hidden text-xs text-gray-500">
                              {item.description}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">
                            <p><span className="font-medium">Categoría:</span> {item.data_category}</p>
                            <p><span className="font-medium">Sensibilidad:</span> {item.sensitivity_level}</p>
                            <p><span className="font-medium">Origen:</span> {item.source_type}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">
                            {item.legal_basis}
                          </td>
                          <td className="max-w-[260px] px-3 py-2 text-gray-700">
                            <p className="line-clamp-3 overflow-hidden">{item.purpose}</p>
                          </td>
                          <td className="max-w-[260px] px-3 py-2 text-gray-700">
                            <p className="line-clamp-3 overflow-hidden">
                              {formatInventoryRetention(item)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-700">
                            <p>Score: {formatInventoryBoolean(item.impacts_scoring)}</p>
                            <p>Consent.: {formatInventoryBoolean(item.requires_consent)}</p>
                            <p>Pública: {formatInventoryBoolean(item.is_public_source)}</p>
                            <p>Activo: {formatInventoryBoolean(item.is_active)}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => editDataInventoryItem(item)}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => deactivateDataInventoryItem(item.id)}
                                disabled={!item.is_active || savingDataInventoryId === item.id}
                                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Desactivar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination
                currentPage={dataInventoryPagination.page}
                totalPages={Math.max(1, dataInventoryPagination.totalPages)}
                onPageChange={setDataInventoryPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "identityVerifications" && (
        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Verificación identidad
              </h2>
              <p className="text-sm text-gray-600">
                Revisa identidad verificable y elegibilidad antes de permitir reportes.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {identityVerificationsPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                value={identityVerificationFilters.document_verification_status}
                onChange={(event) => {
                  setIdentityVerificationFilters((current) => ({
                    ...current,
                    document_verification_status: event.target.value,
                  }));
                  setIdentityVerificationsPage(1);
                }}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Estado identidad</option>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobado</option>
                <option value="rejected">Rechazado</option>
              </select>
              <select
                value={identityVerificationFilters.reporting_eligibility_status}
                onChange={(event) => {
                  setIdentityVerificationFilters((current) => ({
                    ...current,
                    reporting_eligibility_status: event.target.value,
                  }));
                  setIdentityVerificationsPage(1);
                }}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Elegibilidad</option>
                <option value="not_allowed">No habilitado</option>
                <option value="limited">Limitado</option>
                <option value="allowed">Habilitado</option>
                <option value="suspended">Suspendido</option>
              </select>
              <input
                type="text"
                value={identityVerificationFilters.document_number}
                onChange={(event) => {
                  setIdentityVerificationFilters((current) => ({
                    ...current,
                    document_number: event.target.value,
                  }));
                  setIdentityVerificationsPage(1);
                }}
                placeholder="Documento"
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={identityVerificationFilters.user_email}
                onChange={(event) => {
                  setIdentityVerificationFilters((current) => ({
                    ...current,
                    user_email: event.target.value,
                  }));
                  setIdentityVerificationsPage(1);
                }}
                placeholder="Email usuario"
                className="rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {identityVerificationsError && (
            <ErrorAlert
              message={identityVerificationsError}
              onRetry={loadIdentityVerifications}
              retryLabel="Recargar solicitudes"
            />
          )}

          {identityVerificationsNotice && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {identityVerificationsNotice}
            </div>
          )}

          {identityVerificationsLoadingState === "loading" ? (
            <LoadingSkeleton count={3} />
          ) : identityVerifications.length === 0 ? (
            <EmptyState
              title="Sin verificaciones"
              description="No hay solicitudes de identidad con los filtros actuales."
            />
          ) : (
            <>
              <div className="space-y-3">
                {identityVerifications.map((item) => (
                  <article
                    key={item.secure_document_id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={classNames(
                            "rounded-full border px-2.5 py-1 text-xs font-medium",
                            IDENTITY_DOCUMENT_STATUS_STYLES[item.verification_status]
                          )}>
                            Estado documento: {IDENTITY_DOCUMENT_STATUS_LABELS[item.verification_status]}
                          </span>
                          <span className="rounded-full border bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
                            Elegibilidad usuario: {REPORTING_ELIGIBILITY_LABELS[item.user?.reporting_eligibility_status || "not_allowed"]}
                          </span>
                        </div>
                        <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                          <InfoBox label="Usuario" value={item.user_email || item.user?.email || "N/A"} />
                          <InfoBox label="Nombre legal" value={item.full_legal_name || item.user_nombre || item.user?.nombre || "N/A"} />
                          <InfoBox label="Documento" value={`${item.document_type || "N/A"} ${item.document_number || ""}`} />
                          <InfoBox label="Teléfono" value={item.phone_number || "N/A"} />
                          <InfoBox label="Archivo" value={item.file_name || "N/A"} />
                          <InfoBox label="Subido" value={formatDate(item.uploaded_at)} />
                          <InfoBox label="Revisado" value={formatDate(item.reviewed_at)} />
                          <InfoBox label="Categoría" value={item.document_category || "identity_document"} />
                        </div>
                        <p className="mt-3 rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
                          {formatIdentityMetadata(item.metadata?.identity_verification)}
                        </p>
                        {item.admin_notes && (
                          <p className="mt-3 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                            {truncateText(item.admin_notes, 220)}
                          </p>
                        )}
                        {(item.documents || []).length > 0 && (
                          <div className="mt-3 space-y-2">
                            {(item.documents || []).slice(0, 3).map((document) => (
                              <div key={document.id} className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
                                <p className="font-semibold">{document.file_name} · {document.verification_status}</p>
                                <p className="mt-1">{document.mime_type} · {document.file_size} bytes</p>
                                <p className="mt-1">Subido: {formatDate(document.uploaded_at)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 lg:w-40 lg:flex-col">
                        <button
                          type="button"
                          onClick={() => openIdentityDocument(item.secure_document_id)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Ver documento
                        </button>
                        <button
                          type="button"
                          onClick={() => updateIdentityVerification(item.secure_document_id, "approve")}
                          disabled={
                            item.verification_status !== "pending" || pendingIdentityAction !== null
                          }
                          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => updateIdentityVerification(item.secure_document_id, "reject")}
                          disabled={
                            item.verification_status !== "pending" || pendingIdentityAction !== null
                          }
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <Pagination
                currentPage={identityVerificationsPagination.page}
                totalPages={Math.max(1, identityVerificationsPagination.totalPages)}
                onPageChange={setIdentityVerificationsPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "security" && (
        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Seguridad</h2>
              <p className="text-sm text-gray-600">
                MFA TOTP para proteger acciones administrativas críticas.
              </p>
            </div>
            <button
              type="button"
              onClick={loadMfaStatus}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Actualizar
            </button>
          </div>

          {securityError && <ErrorAlert message={securityError} onRetry={loadMfaStatus} />}
          {securityNotice && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {securityNotice}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Estado MFA</h3>
              <div className="mt-4 grid gap-3 text-sm">
                <InfoBox label="MFA" value={mfaStatus?.mfa_enabled ? "Activo" : "No configurado"} />
                <InfoBox
                  label="Ventana reciente"
                  value={mfaStatus?.recent_mfa_valid ? "Válida" : "Requiere verificación"}
                />
                <InfoBox
                  label="Última verificación"
                  value={mfaStatus?.mfa_last_verified_at ? formatDate(mfaStatus.mfa_last_verified_at) : "N/D"}
                />
                <InfoBox
                  label="Backup codes"
                  value={String(mfaStatus?.backup_codes_remaining ?? 0)}
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={mfaChallengeCode}
                  onChange={(event) => setMfaChallengeCode(event.target.value)}
                  placeholder="Código TOTP o backup"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={verifyMfaChallenge}
                  disabled={mfaBusy || !mfaChallengeCode.trim() || !mfaStatus?.mfa_enabled}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Verificar MFA
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Configuración</h3>
              <div className="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={startMfaSetup}
                  disabled={mfaBusy}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Iniciar setup TOTP
                </button>

                {mfaSetupUri && (
                  <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="break-all font-mono text-xs text-gray-700">{mfaSetupUri}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={mfaSetupCode}
                        onChange={(event) => setMfaSetupCode(event.target.value)}
                        placeholder="Código de 6 dígitos"
                        className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={verifyMfaSetup}
                        disabled={mfaBusy || !mfaSetupCode.trim()}
                        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Activar MFA
                      </button>
                    </div>
                  </div>
                )}

                {mfaBackupCodes.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-medium text-amber-900">
                      Backup codes. Guárdalos ahora; no se volverán a mostrar.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {mfaBackupCodes.map((code) => (
                        <code key={code} className="rounded bg-white px-2 py-1 text-sm text-gray-900">
                          {code}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Deshabilitar MFA
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={mfaDisableCode}
                      onChange={(event) => setMfaDisableCode(event.target.value)}
                      placeholder="Código si no hay MFA reciente"
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={disableMfa}
                      disabled={mfaBusy || !mfaStatus?.mfa_enabled}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Deshabilitar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {activeTab === "audit" && (
        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Auditoria administrativa
              </h2>
              <p className="text-sm text-gray-600">
                Trazabilidad append-only de acciones admin y eventos sensibles.
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {auditLogsPagination.total.toLocaleString("es-CO")} registros
            </span>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                value={auditDraftFilters.severity}
                onChange={(event) =>
                  setAuditDraftFilters((current) => ({
                    ...current,
                    severity: event.target.value,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Severidad</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Critica</option>
              </select>
              <input
                type="text"
                value={auditDraftFilters.action_type}
                onChange={(event) =>
                  setAuditDraftFilters((current) => ({
                    ...current,
                    action_type: event.target.value,
                  }))
                }
                placeholder="Accion"
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={auditDraftFilters.admin_email}
                onChange={(event) =>
                  setAuditDraftFilters((current) => ({
                    ...current,
                    admin_email: event.target.value,
                  }))
                }
                placeholder="Email admin"
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={auditDraftFilters.target_type}
                onChange={(event) =>
                  setAuditDraftFilters((current) => ({
                    ...current,
                    target_type: event.target.value,
                  }))
                }
                placeholder="Tipo objetivo"
                className="rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuditFilters(auditDraftFilters);
                  setAuditLogsPage(1);
                }}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuditDraftFilters(EMPTY_AUDIT_FILTERS);
                  setAuditFilters(EMPTY_AUDIT_FILTERS);
                  setAuditLogsPage(1);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Limpiar
              </button>
            </div>
          </div>

          {auditLogsError && <ErrorAlert message={auditLogsError} onRetry={loadAuditLogs} />}

          {auditLogsLoadingState === "loading" ? (
            <LoadingSkeleton count={3} />
          ) : auditLogs.length === 0 ? (
            <EmptyState
              title="Sin registros de auditoria"
              description="No hay eventos que coincidan con los filtros aplicados."
            />
          ) : (
            <>
              <DataTableShell
                title="Bitacora administrativa"
                description="Eventos sensibles, severidad, objetivo y razon registrada."
              >
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Admin</th>
                        <th className="px-4 py-3">Accion</th>
                        <th className="px-4 py-3">Severidad</th>
                        <th className="px-4 py-3">Objetivo</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">request_id</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="align-top hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                            {formatDate(log.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">
                              {log.admin_email || "Sistema / N/D"}
                            </p>
                            <p className="break-all font-mono text-xs text-gray-500">
                              {log.admin_user_id || "N/D"}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-800">
                            {log.action_type}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAuditSeverityClass(log.severity)}`}>
                              {formatAuditSeverity(log.severity)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{log.target_type}</p>
                            <p className="break-all font-mono text-xs text-gray-500">
                              {log.target_id || log.target_reference || "N/D"}
                            </p>
                          </td>
                          <td className="max-w-sm px-4 py-3 text-gray-700">
                            <p>{truncateText(log.reason || "Sin razon registrada", 180)}</p>
                            {(log.previous_state || log.new_state) && (
                              <details className="mt-2 rounded-md border bg-gray-50 p-2">
                                <summary className="cursor-pointer text-xs font-medium text-gray-700">
                                  Resumen de cambios
                                </summary>
                                <div className="mt-2 space-y-2 text-xs text-gray-600">
                                  <p>
                                    <span className="font-semibold">Antes:</span>{" "}
                                    {summarizeAuditState(log.previous_state)}
                                  </p>
                                  <p>
                                    <span className="font-semibold">Despues:</span>{" "}
                                    {summarizeAuditState(log.new_state)}
                                  </p>
                                </div>
                              </details>
                            )}
                          </td>
                          <td className="break-all px-4 py-3 font-mono text-xs text-gray-500">
                            {log.request_id || "N/D"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </DataTableShell>

              <Pagination
                currentPage={auditLogsPagination.page}
                totalPages={Math.max(1, auditLogsPagination.totalPages)}
                onPageChange={setAuditLogsPage}
              />
            </>
          )}
        </section>
        )}

        {activeTab === "signals" && (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Señales judiciales
            </h2>
            <p className="text-sm text-gray-600">
              Gestiona señales judiciales verificables que afectan el score del arrendatario.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <StatCard label="Total" value={signalStats.total} />
            <StatCard label="Detectadas" value={signalStats.detected} />
            <StatCard label="En revisión" value={signalStats.under_review} />
            <StatCard label="Verificadas" value={signalStats.verified} />
            <StatCard label="Rechazadas" value={signalStats.rejected} />
          </div>

          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Buscar señal judicial
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={signalSearch}
                    onChange={(e) => setSignalSearch(e.target.value)}
                    placeholder="Ej: 1030613681, restitución, juzgado civil..."
                    className="w-full rounded-lg border px-3 py-2 pl-10 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>

              <div className="w-full lg:w-72">
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  Filtrar por estado
                </label>
                <select
                  value={signalStatusFilter}
                  onChange={(e) => setSignalStatusFilter(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">Todos los estados</option>
                  <option value="detected">Detectadas</option>
                  <option value="under_review">En revisión</option>
                  <option value="verified">Verificadas</option>
                  <option value="rejected">Rechazadas</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando <span className="font-semibold">{paginatedSignals.length}</span>{" "}
                de <span className="font-semibold">{filteredSignals.length}</span> señales
                {filteredSignals.length !== signals.length && ` (filtradas de ${signals.length})`}
              </span>

              {signalSearch && (
                <button
                  onClick={() => {
                    setSignalSearch("");
                    setSignalStatusFilter("all");
                  }}
                  className="font-medium text-blue-600 hover:text-blue-800"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {signalsError && <ErrorAlert message={signalsError} onRetry={loadSignals} />}

          {signalsLoadingState === "loading" ? (
            <LoadingSkeleton count={2} />
          ) : filteredSignals.length === 0 ? (
            <EmptyState
              title={signals.length === 0 ? "Sin señales judiciales" : "Sin resultados"}
              description={
                signals.length === 0
                  ? "No hay señales judiciales registradas."
                  : "Ninguna señal coincide con los filtros aplicados."
              }
            />
          ) : (
            <>
              <div className="space-y-3">
                {paginatedSignals.map((signal) => (
                  <SignalCard
                    key={signal.id}
                    signal={signal}
                    processingId={processingId || legalTraceSavingId}
                    onVerify={() =>
                      openSignalDecision(signal.id, "verify", {
                        status: "verified",
                        relevance_for_rental_risk: true,
                        score_impact_enabled: true,
                        dispute_status: "none",
                        verification_notes:
                          signal.verification_notes || "Verificada desde panel admin",
                      })
                    }
                    onReview={() =>
                      openSignalDecision(signal.id, "review", {
                        status: "under_review",
                        score_impact_enabled: false,
                      })
                    }
                    onReject={() =>
                      openSignalDecision(signal.id, "reject", {
                        status: "rejected",
                        relevance_for_rental_risk: false,
                        score_impact_enabled: false,
                      })
                    }
                    onToggleImpact={() =>
                      openSignalDecision(signal.id, "toggle-impact", {
                        score_impact_enabled: !signal.score_impact_enabled,
                      })
                    }
                    onToggleDispute={() =>
                      openSignalDecision(signal.id, "toggle-dispute", {
                        dispute_status:
                          signal.dispute_status === "disputed"
                            ? "resolved"
                            : "disputed",
                        dispute_notes:
                          signal.dispute_status === "disputed"
                            ? "Disputa resuelta desde panel admin"
                            : "Marcada como disputada desde panel admin",
                        score_impact_enabled:
                          signal.dispute_status === "disputed"
                            ? signal.score_impact_enabled
                            : false,
                      })
                    }
                    onEditLegalTrace={() => updateSignalLegalTrace(signal)}
                  />
                ))}
              </div>

              <Pagination
                currentPage={signalsPage}
                totalPages={signalsPageCount}
                onPageChange={setSignalsPage}
              />
            </>
          )}
        </section>
        )}
          </div>
        </div>
      </section>

      <ReportDecisionModal
        decision={decision}
        processingId={processingId}
        onClose={closeDecision}
        onConfirm={confirmDecision}
      />

      <SignalDecisionModal
        decision={signalDecision}
        processingId={processingId}
        signal={signals.find((s) => s.id === signalDecision?.signalId)}
        onClose={closeSignalDecision}
        onConfirm={confirmSignalDecision}
      />
      </PageContainer>
    </PlatformShell>
  );
}
