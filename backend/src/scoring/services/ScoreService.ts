import { supabase } from '../../lib/supabase';
import { calculateScore } from '../engine/ScoreCalculator';
import { SCORE_CONFIG } from '../core/config';

type ScoreClassification = 'low' | 'medium' | 'high' | 'critical';

type ScoreCalculationRow = {
  id: string;
  tenant_id: string;
  score: number;
  score_normalized: number;
  classification: ScoreClassification | string;
  factors: any[] | null;
  version: string;
  total_reports: number;
  total_penalty: number;
  created_at: string;
};

type TenantCurrentScoreRow = {
  tenant_id: string;
  score: number;
  score_normalized: number;
  classification: ScoreClassification | string;
  factors: any[] | null;
  version: string;
  total_reports: number;
  total_penalty: number;
  source_score_calculation_id: string | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
};

type ScoreInputReport = {
  tipo_problema: string;
  fecha_reporte: string;
  reportado_por?: string | null;
};

type ReportRow = {
  id?: string;
  tipo_problema: string | null;
  fecha_reporte: string | null;
  reportado_por?: string | null;
  report_verification_status?: string | null;
  scoring_eligibility_status?: string | null;
  subject_notice_required?: boolean | null;
  subject_notice_status?: string | null;
  contradiction_status?: string | null;
};

type LegalCaseSignalRow = {
  id: string;
  tenant_id: string;
  process_type?: string | null;
  process_subject?: string | null;
  court_name?: string | null;
  city?: string | null;
  process_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  dispute_status?: string | null;
  relevance_for_rental_risk?: boolean | null;
  score_impact_enabled?: boolean | null;
};

type ScorePayload = {
  tenant_id: string;
  score: number;
  score_normalized: number;
  classification: string;
  factors: any[];
  version: string;
  total_reports: number;
  total_penalty: number;
};

const SCORE_CALCULATION_SELECT_COLUMNS = [
  'id',
  'tenant_id',
  'score',
  'score_normalized',
  'classification',
  'factors',
  'version',
  'total_reports',
  'total_penalty',
  'created_at',
] as const;

const TENANT_CURRENT_SCORE_SELECT_COLUMNS = [
  'tenant_id',
  'score',
  'score_normalized',
  'classification',
  'factors',
  'version',
  'total_reports',
  'total_penalty',
  'source_score_calculation_id',
  'calculated_at',
  'created_at',
  'updated_at',
] as const;

function isValidDateString(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function resolveSafeDate(value?: string | null, fallback?: string | null): string {
  if (isValidDateString(value)) return String(value);
  if (isValidDateString(fallback)) return String(fallback);
  return new Date().toISOString();
}

function normalizeSearchText(value?: string | null): string {
  return String(value || '').toLowerCase().trim();
}

function resolveSignalProblemType(signal: LegalCaseSignalRow): string {
  const processType = normalizeSearchText(signal.process_type);
  const processSubject = normalizeSearchText(signal.process_subject);
  const combinedText = `${processType} ${processSubject}`;

  if (
    combinedText.includes('restitucion') ||
    combinedText.includes('restitución') ||
    combinedText.includes('desalojo') ||
    combinedText.includes('lanzamiento') ||
    combinedText.includes('arrendamiento') ||
    combinedText.includes('inmueble arrendado')
  ) {
    return 'desalojo';
  }

  if (
    combinedText.includes('fraude') ||
    combinedText.includes('falsedad') ||
    combinedText.includes('documento falso')
  ) {
    return 'fraude';
  }

  if (
    combinedText.includes('ejecutivo') ||
    combinedText.includes('cobro') ||
    combinedText.includes('deuda') ||
    combinedText.includes('obligacion') ||
    combinedText.includes('obligación')
  ) {
    return 'impago';
  }

  return 'desalojo';
}

function buildScoreInputReports(
  reports: ReportRow[],
  verifiedSignals: LegalCaseSignalRow[]
): ScoreInputReport[] {
  const approvedReports: ScoreInputReport[] = reports.map((report) => ({
    tipo_problema: String(report.tipo_problema || ''),
    fecha_reporte: resolveSafeDate(report.fecha_reporte),
    reportado_por: report.reportado_por || null,
  }));

  const judicialSignals: ScoreInputReport[] = verifiedSignals.map((signal) => ({
    tipo_problema: resolveSignalProblemType(signal),
    fecha_reporte: resolveSafeDate(signal.process_date, signal.created_at),
    reportado_por: null,
  }));

  return [...approvedReports, ...judicialSignals];
}

function isVerifiedScoringSignal(signal: LegalCaseSignalRow): boolean {
  return (
    signal.status === 'verified' &&
    signal.dispute_status !== 'disputed' &&
    signal.relevance_for_rental_risk === true &&
    signal.score_impact_enabled === true
  );
}

function isReportNoticeResolvedForScoring(report: ReportRow): boolean {
  if (report.subject_notice_required === false) return true;
  if (report.subject_notice_status === 'waived' || report.subject_notice_status === 'not_required') {
    return true;
  }
  return report.contradiction_status === 'rejected' || report.contradiction_status === 'expired';
}

function calculateTotalPenalty(factors: any[] | null | undefined): number {
  return (factors || []).reduce((acc, factor) => {
    return acc + Number(factor?.penalty || 0);
  }, 0);
}

function normalizeFactors(factors: any[] | null | undefined): any[] {
  return Array.isArray(factors) ? factors : [];
}

function areFactorsEquivalent(
  previousFactors: any[] | null | undefined,
  nextFactors: any[] | null | undefined
): boolean {
  const previous = normalizeFactors(previousFactors);
  const next = normalizeFactors(nextFactors);

  if (previous.length !== next.length) return false;

  try {
    return JSON.stringify(previous) === JSON.stringify(next);
  } catch {
    return false;
  }
}

function isDuplicateScoreSnapshot(
  latestScore: ScoreCalculationRow | null,
  nextPayload: ScorePayload
): boolean {
  if (!latestScore) return false;

  return (
    Number(latestScore.score) === Number(nextPayload.score) &&
    Number(latestScore.score_normalized) === Number(nextPayload.score_normalized) &&
    String(latestScore.classification) === String(nextPayload.classification) &&
    String(latestScore.version) === String(nextPayload.version) &&
    Number(latestScore.total_reports) === Number(nextPayload.total_reports) &&
    Number(latestScore.total_penalty) === Number(nextPayload.total_penalty) &&
    areFactorsEquivalent(latestScore.factors, nextPayload.factors)
  );
}

async function getApprovedReports(tenantId: string): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      [
        'id',
        'tipo_problema',
        'fecha_reporte',
        'reportado_por',
        'report_verification_status',
        'scoring_eligibility_status',
        'subject_notice_required',
        'subject_notice_status',
        'contradiction_status',
      ].join(', ')
    )
    .eq('tenant_id', tenantId)
    .eq('estado', 'aprobado')
    .eq('report_verification_status', 'verified')
    .eq('scoring_eligibility_status', 'eligible')
    .order('fecha_reporte', { ascending: false });

  if (error) {
    throw new Error(`Error obteniendo reportes aprobados: ${error.message}`);
  }

  return (((data || []) as unknown) as ReportRow[]).filter(isReportNoticeResolvedForScoring);
}

async function getVerifiedLegalSignals(tenantId: string): Promise<LegalCaseSignalRow[]> {
  const { data, error } = await supabase
    .from('legal_case_signals')
    .select(`
      id,
      tenant_id,
      process_type,
      process_subject,
      court_name,
      city,
      process_date,
      created_at,
      status,
      dispute_status,
      relevance_for_rental_risk,
      score_impact_enabled
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'verified')
    .eq('relevance_for_rental_risk', true)
    .eq('score_impact_enabled', true)
    .neq('dispute_status', 'disputed')
    .order('process_date', { ascending: false });

  if (error) {
    throw new Error(`Error obteniendo señales judiciales verificadas: ${error.message}`);
  }

  return ((data || []) as LegalCaseSignalRow[]).filter(isVerifiedScoringSignal);
}

export async function getLatestScore(tenantId: string) {
  if (!tenantId) {
    throw new Error('tenantId es requerido para obtener score');
  }

  const { data, error } = await supabase
    .from('score_calculations')
    .select(SCORE_CALCULATION_SELECT_COLUMNS.join(', '))
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error obteniendo score persistido: ${error.message}`);
  }

  return data as ScoreCalculationRow | null;
}

export async function getCurrentScore(tenantId: string) {
  if (!tenantId) {
    throw new Error('tenantId es requerido para obtener score actual');
  }

  const { data, error } = await supabase
    .from('tenant_current_scores')
    .select(TENANT_CURRENT_SCORE_SELECT_COLUMNS.join(', '))
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error obteniendo score actual: ${error.message}`);
  }

  return data as TenantCurrentScoreRow | null;
}

async function upsertCurrentScore(
  payload: ScorePayload,
  sourceScoreCalculationId: string | null
): Promise<TenantCurrentScoreRow> {
  const now = new Date().toISOString();

  const currentPayload = {
    tenant_id: payload.tenant_id,
    score: payload.score,
    score_normalized: payload.score_normalized,
    classification: payload.classification,
    factors: payload.factors,
    version: payload.version,
    total_reports: payload.total_reports,
    total_penalty: payload.total_penalty,
    source_score_calculation_id: sourceScoreCalculationId,
    calculated_at: now,
  };

  const { data, error } = await supabase
    .from('tenant_current_scores')
    .upsert(currentPayload, { onConflict: 'tenant_id' })
    .select(TENANT_CURRENT_SCORE_SELECT_COLUMNS.join(', '))
    .single();

  if (error) {
    throw new Error(`Error actualizando tenant_current_scores: ${error.message}`);
  }

  return (data as unknown) as TenantCurrentScoreRow;
}

export async function calculateAndStoreScore(tenantId: string, _cedula?: string) {
  if (!tenantId) {
    throw new Error('tenantId es requerido para calcular score');
  }

  const reports = await getApprovedReports(tenantId);
  const verifiedSignals = await getVerifiedLegalSignals(tenantId);

  const scoreInputReports = buildScoreInputReports(reports, verifiedSignals);
  const result = calculateScore(scoreInputReports);
  const totalPenalty = calculateTotalPenalty(result.factors);

  const payload: ScorePayload = {
    tenant_id: tenantId,
    score: result.score,
    score_normalized: result.score_normalized,
    classification: result.classification,
    factors: normalizeFactors(result.factors),
    version: SCORE_CONFIG.VERSION,
    total_reports: result.total_reports,
    total_penalty: totalPenalty,
  };

  const latestScore = await getLatestScore(tenantId);

  if (isDuplicateScoreSnapshot(latestScore, payload)) {
    await upsertCurrentScore(payload, latestScore?.id || null);
    return latestScore as ScoreCalculationRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('score_calculations')
    .insert(payload)
    .select(SCORE_CALCULATION_SELECT_COLUMNS.join(', '))
    .single();

  if (insertError) {
    throw new Error(`Error guardando score calculado: ${insertError.message}`);
  }

  const insertedScore = (inserted as unknown) as ScoreCalculationRow;

  await upsertCurrentScore(payload, insertedScore.id);

  return insertedScore;
}
