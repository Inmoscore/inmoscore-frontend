export type ReportScoringState = {
  tenant_id?: string | null;
  estado?: string | null;
  report_verification_status?: string | null;
  scoring_eligibility_status?: string | null;
  subject_notice_required?: boolean | null;
  subject_notice_status?: string | null;
  contradiction_status?: string | null;
};

export function isReportNoticeResolvedForScoring(report: ReportScoringState): boolean {
  if (report.subject_notice_required === false) return true;
  if (report.subject_notice_status === 'waived' || report.subject_notice_status === 'not_required') {
    return true;
  }
  return report.contradiction_status === 'rejected' || report.contradiction_status === 'expired';
}

export function isReportEligibleForScoring(report: ReportScoringState): boolean {
  return (
    report.estado === 'aprobado' &&
    report.report_verification_status === 'verified' &&
    report.scoring_eligibility_status === 'eligible' &&
    isReportNoticeResolvedForScoring(report)
  );
}

export function didReportScoringParticipationChange(
  previousReport: ReportScoringState,
  updatedReport: ReportScoringState
): boolean {
  return isReportEligibleForScoring(previousReport) !== isReportEligibleForScoring(updatedReport);
}

type SynchronizeReportScoringParticipationParams = {
  previousReport: ReportScoringState;
  updatedReport: ReportScoringState;
  tenantId: string;
  invalidateCurrentScore: (tenantId: string) => Promise<void>;
  recalculateScore: (tenantId: string) => Promise<unknown>;
};

export async function synchronizeReportScoringParticipation({
  previousReport,
  updatedReport,
  tenantId,
  invalidateCurrentScore,
  recalculateScore,
}: SynchronizeReportScoringParticipationParams): Promise<boolean> {
  if (!didReportScoringParticipationChange(previousReport, updatedReport)) return false;

  // Invalidate first so a failed recalculation cannot leave the previous score serviceable.
  await invalidateCurrentScore(tenantId);
  await recalculateScore(tenantId);
  return true;
}
