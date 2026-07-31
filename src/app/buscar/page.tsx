'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ClipboardCheck, FileSearch, Search, ShieldCheck } from 'lucide-react';
import { clearSession, getToken } from '@/lib/auth';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { ActionBanner } from '@/components/ui/ActionBanner';
import { AppCard } from '@/components/ui/AppCard';
import { DataTableShell } from '@/components/ui/DataTableShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricCard } from '@/components/ui/MetricCard';
import { PageContainer } from '@/components/ui/PageContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge';
import { emailVerificationFetch as fetch } from '@/lib/emailVerification';

type ScoreFactor = {
  type: string;
  baseWeight: number;
  recurrenceFactor: number;
  recencyFactor: number;
  penalty: number;
};

type ReporteDetalle = {
  id?: string;
  tipo_problema?: string;
  estado?: string;
  fecha_reporte?: string;
  descripcion?: string;
  dispute_status?: string | null;
  legal_review_status?: string | null;
  public_source_flag?: boolean | null;
  source_type?: string | null;
  impacts_scoring?: boolean | null;
  report_verification_status?: string | null;
  scoring_eligibility_status?: string | null;
  subject_notice_status?: string | null;
  contradiction_status?: string | null;
  contradiction_deadline?: string | null;
};

type ProcesoJudicialDetalle = {
  id?: string;
  tipo_proceso?: string;
  juzgado?: string;
  ciudad?: string;
  fecha?: string;
  fecha_proceso?: string;
  process_type?: string;
  court_name?: string;
  city?: string;
  process_date?: string;
  process_subject?: string;
  status?: string;
  dispute_status?: string;
  legal_review_status?: string | null;
  public_source_flag?: boolean | null;
  source_type?: string | null;
  impacts_scoring?: boolean | null;
  score_impact_enabled?: boolean;
  relevance_for_rental_risk?: boolean;
};

type LegalFlags = {
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

type ScoreExplanation = {
  score: number | null;
  classification: string | null;
  summary: string;
  factors: ScoreExplanationFactor[];
  legal_caution_required: boolean;
  human_review_recommended: boolean;
};

type RentalHistorySummary = {
  total_verified: number;
  average_duration_months?: number | null;
  average_monthly_rent_amount?: number | null;
  formal_handover_count?: number;
  late_payment_count?: number;
  property_damage_count?: number;
  supporting_documents_count?: number;
};

type RentalHistoryDetail = {
  id: string;
  subject_type?: string | null;
  subject_document_type?: string | null;
  subject_document_number?: string | null;
  source_type?: string | null;
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

type ResultadoBusqueda = {
  success: boolean;
  cedula: string;
  nombre: string | null;
  score: number | null;
  clasificacion: string | null;
  clasificacion_detallada?: string | null;
  total_reportes: number;
  reportes_aprobados: number;
  procesos_judiciales: number;
  detalle_reportes: ReporteDetalle[];
  detalle_procesos: ProcesoJudicialDetalle[];
  score_factores?: ScoreFactor[];
  score_version?: string;
  plan_type?: string | null;
  daily_limit?: number | null;
  remaining_searches?: number | null;
  used_searches?: number;
  bonus_credits_available?: number | null;
  bonus_credit_used?: boolean;
  rental_history_summary?: RentalHistorySummary;
  rental_histories?: RentalHistoryDetail[];
  rental_history_locked?: boolean;
  rental_history_detail_level?: 'none' | 'summary' | 'full';
  legal_flags?: LegalFlags;
  score_explanation?: ScoreExplanation;
};

const MIN_CEDULA_LENGTH = 6;
const MAX_CEDULA_LENGTH = 10;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, MAX_CEDULA_LENGTH);
}

function isValidCedula(value: string): boolean {
  return new RegExp(`^\\d{${MIN_CEDULA_LENGTH},${MAX_CEDULA_LENGTH}}$`).test(value);
}

function getScoreColor(score: number | null) {
  if (score === null) return 'bg-gray-500';
  if (score >= 85) return 'bg-green-600';
  if (score >= 70) return 'bg-yellow-500';
  if (score >= 50) return 'bg-orange-500';
  return 'bg-red-600';
}

function getScoreTextColor(score: number | null) {
  if (score === null) return 'text-gray-700';
  if (score >= 85) return 'text-green-700';
  if (score >= 70) return 'text-yellow-700';
  if (score >= 50) return 'text-orange-700';
  return 'text-red-700';
}

function getRiskTone(score: number | null): StatusTone {
  if (score === null) return 'neutral';
  if (score >= 85) return 'success';
  if (score >= 70) return 'warning';
  if (score >= 50) return 'review';
  return 'error';
}

function getClassificationTone(clasificacion: string | null): StatusTone {
  switch ((clasificacion || '').toLowerCase()) {
    case 'bajo':
      return 'success';
    case 'medio':
      return 'warning';
    case 'alto':
      return 'review';
    case 'crítico':
    case 'critico':
      return 'error';
    default:
      return 'neutral';
  }
}

function getConfidenceLevel(resultado: ResultadoBusqueda) {
  const totalSignals = (resultado.total_reportes || 0) + (resultado.procesos_judiciales || 0);
  const verifiedHistory = resultado.rental_history_summary?.total_verified ?? 0;
  const legalFlags = resultado.legal_flags;

  if (legalFlags?.has_disputed_items || legalFlags?.has_items_pending_legal_review) {
    return { label: 'Requiere cautela', tone: 'warning' as StatusTone };
  }

  if (totalSignals >= 3 || verifiedHistory >= 2) {
    return { label: 'Alta', tone: 'success' as StatusTone };
  }

  if (totalSignals > 0 || verifiedHistory > 0) {
    return { label: 'Media', tone: 'info' as StatusTone };
  }

  return { label: 'Limitada', tone: 'pending' as StatusTone };
}

function getClassificationBadgeClass(clasificacion: string | null) {
  switch ((clasificacion || '').toLowerCase()) {
    case 'bajo':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'medio':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'alto':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'crítico':
    case 'critico':
      return 'bg-red-200 text-red-900 border-red-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function formatFactorType(type: string) {
  switch (type) {
    case 'late_payment_minor':
      return 'Mora leve';
    case 'non_payment_relevant':
      return 'Impago relevante';
    case 'non_payment_severe':
      return 'Impago severo';
    case 'property_damage_minor':
      return 'Daño menor al inmueble';
    case 'property_damage_major':
      return 'Daño relevante al inmueble';
    case 'property_damage_severe':
      return 'Daño severo al inmueble';
    case 'coexistence_issue':
      return 'Problema de convivencia';
    case 'unauthorized_use':
      return 'Uso no autorizado';
    case 'document_fraud':
      return 'Fraude documental';
    case 'judicial_process':
      return 'Proceso judicial';
    default:
      return type || 'Factor no clasificado';
  }
}

function buildScoreExplanation(resultado: ResultadoBusqueda) {
  if (resultado.score === null) {
    return 'No hay suficiente información para calcular el score.';
  }

  if ((resultado.total_reportes || 0) === 0 && (resultado.procesos_judiciales || 0) === 0) {
    return 'No se encontraron señales negativas aprobadas ni procesos judiciales verificados asociados.';
  }

  if (resultado.score >= 85) {
    return 'El perfil presenta señales de riesgo bajas dentro del modelo actual.';
  }

  if (resultado.score >= 70) {
    return 'El perfil presenta señales moderadas que requieren revisión antes de tomar una decisión.';
  }

  if (resultado.score >= 50) {
    return 'El perfil presenta señales importantes de riesgo y debe analizarse con mayor cautela.';
  }

  return 'El perfil presenta señales de riesgo altas o críticas según el modelo actual.';
}

function getTopFactors(factors?: ScoreFactor[]) {
  if (!factors || factors.length === 0) return [];
  return [...factors].sort((a, b) => b.penalty - a.penalty).slice(0, 5);
}

function formatDisplayDate(dateValue?: string | null) {
  if (!dateValue) return 'N/A';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatCurrencyCOP(value?: number | null, currency = 'COP') {
  if (typeof value !== 'number') return 'N/A';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency || 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBoolean(value?: boolean | null) {
  if (value === true) return 'Sí';
  if (value === false) return 'No';
  return 'N/A';
}

function formatRentalHistorySubjectType(value?: string | null) {
  if (value === 'natural_person') return 'Persona natural';
  if (value === 'legal_entity') return 'Empresa';
  return 'N/A';
}

function formatRentalHistorySourceType(value?: string | null) {
  if (value === 'lessor_reported') return 'Historial aportado por arrendador y verificado';
  if (value === 'tenant_self_declared') return 'Historial autodeclarado verificado';
  if (value === 'admin_imported') return 'Carga administrativa verificada';
  return 'N/A';
}

function formatRiskText(value?: string | null) {
  if (!value) return 'riesgo no disponible';
  return value.replaceAll('_', ' ');
}

function StatItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return <MetricCard label={label} value={value ?? 'N/A'} />;
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <EmptyState title="Sin datos disponibles" description={String(children)} />
  );
}

function isDisputedLegalStatus(status?: string | null) {
  return status === 'disputed' || status === 'opened' || status === 'under_review';
}

function isPendingLegalReviewStatus(status?: string | null) {
  return status === 'pending' || status === 'needs_more_info' || status === 'pending_verification' || status === 'in_review';
}

function LegalBadge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'amber' | 'blue' | 'green' | 'gray' }) {
  const statusTone: StatusTone =
    tone === 'amber' ? 'warning' : tone === 'blue' ? 'info' : tone === 'green' ? 'success' : 'neutral';

  return <StatusBadge tone={statusTone}>{children}</StatusBadge>;
}

function LegalBadges({
  dispute_status,
  legal_review_status,
  report_verification_status,
  scoring_eligibility_status,
  subject_notice_status,
  contradiction_status,
  public_source_flag,
  impacts_scoring,
}: {
  dispute_status?: string | null;
  legal_review_status?: string | null;
  report_verification_status?: string | null;
  scoring_eligibility_status?: string | null;
  subject_notice_status?: string | null;
  contradiction_status?: string | null;
  public_source_flag?: boolean | null;
  impacts_scoring?: boolean | null;
}) {
  const badges = [
    isDisputedLegalStatus(dispute_status) ? <LegalBadge key="disputed" tone="amber">En disputa</LegalBadge> : null,
    isPendingLegalReviewStatus(legal_review_status) || isPendingLegalReviewStatus(report_verification_status) ? <LegalBadge key="review" tone="amber">Revisión pendiente</LegalBadge> : null,
    scoring_eligibility_status && scoring_eligibility_status !== 'eligible' ? <LegalBadge key="eligibility" tone="gray">No elegible score</LegalBadge> : null,
    subject_notice_status && subject_notice_status !== 'sent' && subject_notice_status !== 'waived' && subject_notice_status !== 'not_required' ? <LegalBadge key="notice" tone="amber">Notificación pendiente</LegalBadge> : null,
    contradiction_status && contradiction_status !== 'none' ? <LegalBadge key="contradiction" tone="amber">Contradicción {contradiction_status}</LegalBadge> : null,
    public_source_flag === true ? <LegalBadge key="public" tone="blue">Fuente pública</LegalBadge> : null,
    impacts_scoring === true ? <LegalBadge key="score" tone="green">Impacta score</LegalBadge> : null,
  ].filter(Boolean);

  if (badges.length === 0) return null;

  return <div className="mt-3 flex flex-wrap gap-2">{badges}</div>;
}

function getExplanationTone(factor: ScoreExplanationFactor) {
  if (factor.direction === 'positive') return 'border-green-200 bg-green-50 text-green-900';
  if (factor.direction === 'negative') return 'border-orange-200 bg-orange-50 text-orange-900';
  return 'border-gray-200 bg-gray-50 text-gray-800';
}

function ScoreExplanationSection({ resultado }: { resultado: ResultadoBusqueda }) {
  const explanation = resultado.score_explanation;
  const reviewParams = new URLSearchParams();
  if (resultado.cedula) reviewParams.set('cedula', resultado.cedula);
  if (resultado.score !== null) reviewParams.set('score', String(resultado.score));
  if (resultado.clasificacion) reviewParams.set('classification', resultado.clasificacion);
  const reviewHref = `/legal/revision-humana${reviewParams.toString() ? `?${reviewParams.toString()}` : ''}`;
  const factors = explanation?.factors?.length
    ? explanation.factors
    : [
        {
          key: 'legacy_summary',
          label: 'Resumen disponible',
          direction: 'neutral' as const,
          severity: 'low' as const,
          description: buildScoreExplanation(resultado),
          impacts_score: false,
          disputed: false,
          pending_legal_review: false,
        },
      ];

  return (
    <AppCard>
      <h3 className="mb-3 text-xl font-black text-slate-950">
        ¿Por qué este resultado?
      </h3>

      <p className="leading-7 text-slate-700">
        {explanation?.summary || buildScoreExplanation(resultado)}
      </p>

      {(explanation?.legal_caution_required || explanation?.human_review_recommended) && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {explanation?.legal_caution_required && (
            <p className="font-semibold">
              Hay información en disputa o pendiente de revisión legal; interpreta este resultado con cautela.
            </p>
          )}
          {explanation?.human_review_recommended && (
            <p className="mt-1">
              Se recomienda revisión humana antes de usar este resultado como soporte de análisis.
            </p>
          )}
          {explanation?.human_review_recommended && (
            <Link
              href={reviewHref}
              className="mt-3 inline-flex rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
            >
              Solicitar revisión humana
            </Link>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {factors.slice(0, 5).map((factor) => (
          <article
            key={factor.key}
            className={`rounded-xl border p-4 ${getExplanationTone(factor)}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{factor.label}</p>
              <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold">
                {factor.severity === 'high' ? 'Alta' : factor.severity === 'medium' ? 'Media' : 'Baja'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6">{factor.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {factor.impacts_score && <LegalBadge tone="green">Impacta score</LegalBadge>}
              {factor.disputed && <LegalBadge tone="amber">En disputa</LegalBadge>}
              {factor.pending_legal_review && <LegalBadge tone="amber">Revisión legal pendiente</LegalBadge>}
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        Este resultado es una señal de apoyo para análisis de riesgo, no una decisión automática definitiva.
      </p>
    </AppCard>
  );
}

function SearchLimitCard({
  plan_type,
  daily_limit,
  remaining_searches,
  bonus_credits_available,
  bonus_credit_used,
  onUpgradeClick,
}: {
  plan_type?: string | null;
  daily_limit?: number | null;
  remaining_searches?: number | null;
  bonus_credits_available?: number | null;
  bonus_credit_used?: boolean;
  onUpgradeClick: () => void;
}) {
  if (remaining_searches === undefined) {
    return null;
  }

  const limit = daily_limit ?? 3;
  const remaining = remaining_searches ?? 0;
  const bonusCredits = bonus_credits_available ?? 0;

  if (daily_limit === null || plan_type === 'admin') {
    return (
      <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-green-800 shadow-sm">
        <p className="font-semibold">Búsquedas ilimitadas disponibles</p>
      </div>
    );
  }

  if (bonus_credit_used) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900 shadow-sm">
        <p className="font-semibold">Usaste 1 crédito extra para esta consulta.</p>
        {bonusCredits > 0 && (
          <p className="mt-1 text-sm text-emerald-700">
            Te quedan {bonusCredits} crédito(s) extra disponible(s).
          </p>
        )}
      </div>
    );
  }

  if (remaining === 0) {
    if (bonusCredits > 0) {
      return (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900 shadow-sm">
          <p className="font-semibold">
            Has agotado tus búsquedas del plan, pero tienes {bonusCredits} crédito(s) extra disponible(s).
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            Se usará un crédito extra en tu próxima búsqueda.
          </p>
          {bonus_credit_used && (
            <p className="mt-2 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-sm font-semibold text-emerald-800">
              Usaste 1 crédito extra para esta consulta.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-900 shadow-sm">
        <p className="font-semibold">Has alcanzado el límite diario de búsquedas</p>
        <p className="mt-1 text-sm text-red-700">Vuelve mañana o mejora tu plan para continuar.</p>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Mejorar plan
        </button>
      </div>
    );
  }

  if (remaining === 1) {
    return (
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900 shadow-sm">
        <p className="font-semibold">Última búsqueda disponible hoy</p>
        <p className="mt-1 text-sm text-amber-700">Actualiza tu plan para seguir consultando sin interrupciones.</p>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="mt-3 rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          Ver planes
        </button>
      </div>
    );
  }

  if (remaining === 2) {
    return (
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4 text-amber-900 shadow-sm">
        <p className="font-semibold">Te quedan 2 búsquedas hoy</p>
        <p className="mt-1 text-sm text-amber-700">Mejora tu plan antes de quedarte sin consultas.</p>
        <button
          type="button"
          onClick={onUpgradeClick}
          className="mt-2 text-sm font-semibold text-amber-800 underline-offset-2 transition hover:underline"
        >
          Ver planes
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-blue-900 shadow-sm">
      <p className="font-semibold">Te quedan {remaining} de {limit} búsquedas hoy</p>
    </div>
  );
}

function RentalHistorySection({
  resultado,
  onUpgradeClick,
}: {
  resultado: ResultadoBusqueda;
  onUpgradeClick: () => void;
}) {
  const summary = resultado.rental_history_summary;
  const totalVerified = summary?.total_verified ?? 0;
  const detailLevel = resultado.rental_history_detail_level || 'none';

  return (
    <AppCard>
      <SectionHeader
        eyebrow="Rental history"
        title="Historial arrendaticio verificado"
        description="Visibilidad según plan: teaser, resumen operativo o detalle completo."
      />

      {totalVerified === 0 ? (
        <EmptyBox>
          No hay historial arrendaticio verificado disponible para esta cédula.
        </EmptyBox>
      ) : resultado.rental_history_locked ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <p className="font-semibold">Hay historial arrendaticio verificado disponible.</p>
          <p className="mt-1 text-sm leading-6 text-blue-800">
            Mejora tu plan para consultar el resumen de duración, canon y cumplimiento.
          </p>
          <button
            type="button"
            onClick={onUpgradeClick}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Ver planes
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <StatItem label="Registros verificados" value={totalVerified} />
            <StatItem label="Duración promedio" value={summary?.average_duration_months !== null && summary?.average_duration_months !== undefined ? `${summary.average_duration_months} meses` : 'N/A'} />
            <StatItem label="Canon promedio" value={formatCurrencyCOP(summary?.average_monthly_rent_amount)} />
            <StatItem label="Entregas formales" value={summary?.formal_handover_count ?? 0} />
            <StatItem label="Registros con mora" value={summary?.late_payment_count ?? 0} />
            <StatItem label="Daños verificados" value={summary?.property_damage_count ?? 0} />
            <StatItem label="Soporte documental" value={summary?.supporting_documents_count ?? 0} />
          </div>

          {detailLevel === 'full' && (resultado.rental_histories?.length || 0) > 0 && (
            <div className="space-y-3">
              {resultado.rental_histories?.map((history) => (
                <article
                  key={history.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2 lg:grid-cols-3">
                    {history.subject_document_number && (
                      <p>
                        <strong>Documento:</strong> {history.subject_document_type || 'CC'}{' '}
                        {history.subject_document_number}
                      </p>
                    )}
                    {history.subject_type && (
                      <p>
                        <strong>Tipo titular:</strong> {formatRentalHistorySubjectType(history.subject_type)}
                      </p>
                    )}
                    {history.source_type && (
                      <p>
                        <strong>Origen:</strong> {formatRentalHistorySourceType(history.source_type)}
                      </p>
                    )}
                    <p><strong>Ciudad:</strong> {history.city || 'N/A'}</p>
                    <p><strong>Tipo inmueble:</strong> {history.property_type || 'N/A'}</p>
                    <p>
                      <strong>Contrato:</strong>{' '}
                      {formatDisplayDate(history.contract_start_date)} - {formatDisplayDate(history.contract_end_date)}
                    </p>
                    <p><strong>Canon:</strong> {formatCurrencyCOP(history.monthly_rent_amount, history.currency || 'COP')}</p>
                    <p>
                      <strong>Mora:</strong> {formatBoolean(history.had_late_payments)}
                      {history.had_late_payments ? ` (${history.late_payment_months ?? 0} meses)` : ''}
                    </p>
                    <p><strong>Entrega formal:</strong> {formatBoolean(history.formal_handover)}</p>
                    <p><strong>Soporte documental:</strong> {formatBoolean(history.has_supporting_documents)}</p>
                    <p><strong>Verificado en:</strong> {formatDisplayDate(history.verified_at)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </AppCard>
  );
}

export default function BuscarPage() {
  const router = useRouter();

  const [cedula, setCedula] = useState('');
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [limitInfo, setLimitInfo] = useState<{
    plan_type?: string | null;
    daily_limit?: number | null;
    remaining_searches?: number | null;
    used_searches?: number;
    bonus_credits_available?: number | null;
    bonus_credit_used?: boolean;
  }>({});

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  const cedulaValida = useMemo(() => isValidCedula(cedula), [cedula]);
  const noEncontrado = resultado && resultado.nombre === null;

  const handleUpgradeClick = useCallback(async () => {
    try {
      if (API_URL) {
        const token = getToken();

        if (token) {
          await fetch(`${API_URL}/api/upgrade-events`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              event_type: 'upgrade_cta_clicked',
              source: 'buscar_limit_card',
              plan_type: limitInfo.plan_type === 'pro' ? 'pro' : 'free',
              metadata: {
                remaining_searches: limitInfo.remaining_searches,
                daily_limit: limitInfo.daily_limit,
                used_searches: limitInfo.used_searches,
                bonus_credits_available: limitInfo.bonus_credits_available,
                timestamp_client: new Date().toISOString(),
              },
            }),
          });
        }
      }
    } catch {}

    router.push('/upgrade');
  }, [API_URL, limitInfo.bonus_credits_available, limitInfo.daily_limit, limitInfo.plan_type, limitInfo.remaining_searches, limitInfo.used_searches, router]);

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  const handleGoHome = () => {
    router.push('/');
  };

  const buscarArrendatario = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const cleanCedula = cedula.trim();

    setError('');
    setResultado(null);

    if (!API_URL) {
      setError('La URL del backend no está configurada');
      return;
    }

    if (!isValidCedula(cleanCedula)) {
      setError(`La cédula debe tener entre ${MIN_CEDULA_LENGTH} y ${MAX_CEDULA_LENGTH} dígitos`);
      return;
    }

    const token = getToken();

    if (!token) {
      setError('Debes iniciar sesión para realizar búsquedas');
      router.push('/login');
      return;
    }

    setCargando(true);

    try {
      const response = await fetch(
        `${API_URL}/api/tenants/search?cedula=${encodeURIComponent(cleanCedula)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        }
      );

      let data: Partial<ResultadoBusqueda> & { limit?: number; message?: string } = {};

      try {
        data = await response.json();
      } catch {
        throw new Error('El servidor devolvió una respuesta inválida');
      }

      setLimitInfo({
        plan_type: data.plan_type,
        daily_limit: data.daily_limit,
        remaining_searches: data.remaining_searches,
        used_searches: data.used_searches,
        bonus_credits_available: data.bonus_credits_available,
        bonus_credit_used: data.bonus_credit_used,
      });

      if (response.status === 401 || response.status === 403) {
        clearSession();
        router.push('/login');
        return;
      }

      if (response.status === 429) {
        setLimitInfo({
          plan_type: data.plan_type || limitInfo.plan_type || 'free',
          daily_limit:
            data.daily_limit ??
            (typeof data.limit === 'number' ? data.limit : limitInfo.daily_limit ?? null),
          remaining_searches: 0,
          used_searches: data.used_searches ?? limitInfo.used_searches,
          bonus_credits_available: data.bonus_credits_available ?? limitInfo.bonus_credits_available ?? 0,
          bonus_credit_used: false,
        });
        return;
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'No se pudo completar la búsqueda');
      }

      setResultado(data as ResultadoBusqueda);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al conectar con el servidor';
      setError(message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <PlatformShell
      title="Análisis de riesgo"
      eyebrow="Módulo de riesgo"
      description="Consulta score, señales verificadas e historial arrendaticio aprobado."
    >
      <PageContainer>
        <ActionBanner
          title="Risk Analysis Workspace"
          description="Busca por cédula, revisa señales verificadas y separa el análisis de score, historial y cautelas legales."
          tone="dark"
          action={
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">Plan {limitInfo.plan_type || resultado?.plan_type || 'free'}</StatusBadge>
              <StatusBadge tone={limitInfo.remaining_searches === 0 ? 'warning' : 'success'}>
                {limitInfo.daily_limit === null || limitInfo.plan_type === 'admin'
                  ? 'Límite ilimitado'
                  : `${limitInfo.remaining_searches ?? '-'} consultas restantes`}
              </StatusBadge>
            </div>
          }
        />
        <header className="mb-6 flex flex-col gap-4 rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              Consulta con trazabilidad
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Análisis de riesgo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Consulta el historial aprobado, señales judiciales verificadas e InmoScore vigente.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleGoHome}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 font-bold text-white transition hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
              Inicio
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl bg-white px-4 py-2 font-bold text-slate-950 transition hover:bg-slate-100"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <form
          onSubmit={buscarArrendatario}
          className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        >
          <SectionHeader
            eyebrow="Consulta por cédula"
            title="Panel de búsqueda"
            description="Ingresa una cédula para iniciar el análisis de riesgo inmobiliario con trazabilidad legal."
          />
          <div className="mt-5">
          <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
            <Search className="h-4 w-4 text-blue-700" />
            Número de Cédula
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={cedula}
              onChange={(e) => setCedula(onlyDigits(e.target.value))}
              className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              placeholder="Ej: 1030613681"
              required
              disabled={cargando}
              inputMode="numeric"
              autoComplete="off"
              maxLength={MAX_CEDULA_LENGTH}
            />

            <button
              type="submit"
              disabled={cargando || !cedulaValida}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <FileSearch className="h-5 w-5" />
              {cargando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Ingresa entre {MIN_CEDULA_LENGTH} y {MAX_CEDULA_LENGTH} dígitos.
          </p>
          </div>
        </form>

        <SearchLimitCard
          plan_type={limitInfo.plan_type}
          daily_limit={limitInfo.daily_limit}
          remaining_searches={limitInfo.remaining_searches}
          bonus_credits_available={limitInfo.bonus_credits_available}
          bonus_credit_used={limitInfo.bonus_credit_used}
          onUpgradeClick={handleUpgradeClick}
        />

        <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-950">
                ¿Conoces historial arrendaticio verificable?
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Puedes aportar información básica para revisión; no impacta el score automáticamente.
              </p>
            </div>
          </div>
          <Link
            href="/aportar-historial"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-50"
          >
            Aportar historial
          </Link>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {cargando && (
          <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="animate-pulse space-y-4">
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-200" />
            </div>
          </div>
        )}

        {resultado && noEncontrado && (
          <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-5 text-yellow-900 shadow-sm">
            No se encontró historial para la cédula <strong>{resultado.cedula}</strong>.
          </div>
        )}

        {resultado && !noEncontrado && (
          <div className="space-y-6">
            <AppCard>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <SectionHeader
                    eyebrow="Risk summary"
                    title="Resumen de riesgo"
                    description="Score, clasificación, nivel de confianza y señales base del análisis."
                    action={<StatusBadge tone={getConfidenceLevel(resultado).tone}>Confianza {getConfidenceLevel(resultado).label}</StatusBadge>}
                  />

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <StatItem label="Nombre" value={resultado.nombre} />
                    <StatItem label="Cédula" value={resultado.cedula} />
                    <StatItem label="Total reportes" value={resultado.total_reportes} />
                    <StatItem label="Reportes aprobados" value={resultado.reportes_aprobados} />
                    <StatItem label="Procesos judiciales" value={resultado.procesos_judiciales} />
                    <StatItem label="Versión score" value={resultado.score_version || 'v1.0'} />
                  </div>

                  <div className="mt-4">
                    <span className="mr-2 text-sm font-bold text-slate-700">
                      Clasificación:
                    </span>
                    <StatusBadge tone={getClassificationTone(resultado.clasificacion)}>
                      {resultado.clasificacion || 'N/A'}
                    </StatusBadge>
                    {resultado.legal_flags?.has_disputed_items && (
                      <StatusBadge tone="warning">Items en disputa</StatusBadge>
                    )}
                    {resultado.legal_flags?.has_items_pending_legal_review && (
                      <StatusBadge tone="warning">Revisión legal pendiente</StatusBadge>
                    )}
                    {resultado.legal_flags?.has_reports_not_eligible_for_scoring && (
                      <StatusBadge tone="neutral">Reportes no elegibles</StatusBadge>
                    )}
                  </div>
                </div>

                <div className="w-full rounded-3xl border border-slate-200 bg-slate-950 p-5 text-center text-white shadow-lg sm:w-[240px]">
                  <div className="mb-3 text-sm font-bold text-slate-300">
                    InmoScore
                  </div>

                  <div
                    className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full text-4xl font-black text-white ring-8 ring-white/10 ${getScoreColor(
                      resultado.score
                    )}`}
                  >
                    {resultado.score ?? '--'}
                  </div>

                  <div className="mt-4 text-sm font-black text-slate-100">
                    {formatRiskText(resultado.clasificacion_detallada)}
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    Herramienta de apoyo. No reemplaza revisión humana ni validación documental.
                  </p>
                </div>
              </div>
            </AppCard>

            {(resultado.legal_flags?.has_disputed_items ||
              resultado.legal_flags?.has_items_pending_legal_review ||
              resultado.legal_flags?.has_reports_not_eligible_for_scoring) && (
              <ActionBanner
                tone="warning"
                title="Cautela legal activa"
                description={`Este resultado contiene información en disputa o pendiente de revisión. Interpreta el score con cautela.${
                  resultado.legal_flags?.has_reports_not_eligible_for_scoring
                    ? ` Hay ${resultado.legal_flags.reports_not_eligible_for_scoring_count} reporte(s) no elegible(s) para scoring. No modifican el score actual.`
                    : ''
                }`}
                action={<AlertTriangle className="h-5 w-5" />}
              />
            )}

            <ScoreExplanationSection resultado={resultado} />

            <RentalHistorySection
              resultado={resultado}
              onUpgradeClick={handleUpgradeClick}
            />

            <AppCard>
              <SectionHeader
                eyebrow="Next actions"
                title="Próximas acciones recomendadas"
                description="Acciones contextuales para completar el análisis, aportar evidencia o escalar revisión."
              />
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Link
                  href="/aportar-historial"
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-950 transition hover:bg-white hover:shadow-sm"
                >
                  Aportar historial
                  <span className="mt-2 block text-xs font-medium leading-5 text-slate-500">
                    Complementa el perfil con historial verificable.
                  </span>
                </Link>
                <Link
                  href="/reportar"
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-950 transition hover:bg-white hover:shadow-sm"
                >
                  Reportar incumplimiento
                  <span className="mt-2 block text-xs font-medium leading-5 text-slate-500">
                    Inicia un reporte con soporte y revisión.
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={handleUpgradeClick}
                  className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left text-sm font-black text-blue-950 transition hover:bg-white hover:shadow-sm"
                >
                  Mejorar plan
                  <span className="mt-2 block text-xs font-medium leading-5 text-blue-700">
                    Desbloquea más detalle y consultas.
                  </span>
                </button>
                {resultado.score_explanation?.human_review_recommended ||
                resultado.score_explanation?.legal_caution_required ? (
                  <Link
                    href={`/legal/revision-humana?cedula=${encodeURIComponent(resultado.cedula)}${
                      resultado.score !== null ? `&score=${encodeURIComponent(String(resultado.score))}` : ''
                    }${
                      resultado.clasificacion ? `&classification=${encodeURIComponent(resultado.clasificacion)}` : ''
                    }`}
                    className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-950 transition hover:bg-white hover:shadow-sm"
                  >
                    Solicitar revisión humana
                    <span className="mt-2 block text-xs font-medium leading-5 text-amber-800">
                      Escala el resultado por cautela legal.
                    </span>
                  </Link>
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-950">
                    Sin escalamiento sugerido
                    <span className="mt-2 block text-xs font-medium leading-5 text-emerald-800">
                      No hay cautela legal activa en este resultado.
                    </span>
                  </div>
                )}
              </div>
            </AppCard>

            <DataTableShell
              title="Reportes asociados"
              description="Reportes aprobados, estado operativo y trazabilidad legal visible."
            >
              {resultado.detalle_reportes?.length > 0 ? (
                <div className="space-y-4 p-5 sm:p-6">
                  {resultado.detalle_reportes.map((reporte, index) => (
                    <article
                      key={reporte.id || index}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <p>
                        <strong>Tipo:</strong> {reporte.tipo_problema || 'N/A'}
                      </p>
                      <p>
                        <strong>Estado:</strong>{' '}
                        <StatusBadge tone={reporte.estado === 'aprobado' ? 'success' : 'neutral'}>
                          {reporte.estado || 'N/A'}
                        </StatusBadge>
                      </p>
                      <p>
                        <strong>Fecha:</strong> {formatDisplayDate(reporte.fecha_reporte)}
                      </p>
                      <p>
                        <strong>Descripción:</strong> {reporte.descripcion || 'N/A'}
                      </p>
                      <LegalBadges
                        dispute_status={reporte.dispute_status}
                        legal_review_status={reporte.legal_review_status}
                        report_verification_status={reporte.report_verification_status}
                        scoring_eligibility_status={reporte.scoring_eligibility_status}
                        subject_notice_status={reporte.subject_notice_status}
                        contradiction_status={reporte.contradiction_status}
                        public_source_flag={reporte.public_source_flag}
                        impacts_scoring={reporte.impacts_scoring}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBox>
                  No hay reportes aprobados para este arrendatario.
                </EmptyBox>
              )}
            </DataTableShell>

            <DataTableShell
              title="Señales judiciales verificadas"
              description="Procesos verificados con fuente, fecha, ciudad y cautelas legales."
            >
              {resultado.detalle_procesos?.length > 0 ? (
                <div className="space-y-4 p-5 sm:p-6">
                  {resultado.detalle_procesos.map((proceso, index) => (
                    <article
                      key={proceso.id || index}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <p>
                        <strong>Tipo proceso:</strong>{' '}
                        {proceso.process_type || proceso.tipo_proceso || 'N/A'}
                      </p>
                      <p>
                        <strong>Juzgado:</strong>{' '}
                        {proceso.court_name || proceso.juzgado || 'N/A'}
                      </p>
                      <p>
                        <strong>Ciudad:</strong>{' '}
                        {proceso.city || proceso.ciudad || 'N/A'}
                      </p>
                      <p>
                        <strong>Fecha:</strong>{' '}
                        {formatDisplayDate(
                          proceso.process_date ||
                            proceso.fecha_proceso ||
                            proceso.fecha
                        )}
                      </p>
                      {proceso.status && (
                        <p className="mt-2">
                          <strong>Estado:</strong>{' '}
                          <StatusBadge tone={proceso.status === 'verified' ? 'success' : 'neutral'}>
                            {proceso.status}
                          </StatusBadge>
                        </p>
                      )}

                      {proceso.process_subject && (
                        <p className="mt-2 text-sm text-gray-600">
                          <strong>Detalle:</strong> {proceso.process_subject}
                        </p>
                      )}
                      <LegalBadges
                        dispute_status={proceso.dispute_status}
                        legal_review_status={proceso.legal_review_status}
                        public_source_flag={proceso.public_source_flag}
                        impacts_scoring={proceso.impacts_scoring ?? proceso.score_impact_enabled}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBox>
                  No se encontraron procesos judiciales verificados con impacto en score.
                </EmptyBox>
              )}
            </DataTableShell>
          </div>
        )}
      </PageContainer>
    </PlatformShell>
  );
}
