import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ReportScoringState,
  synchronizeReportScoringParticipation,
} from './reportScoringParticipation';

const tenantId = '11111111-1111-4111-8111-111111111111';

function report(overrides: Partial<ReportScoringState> = {}): ReportScoringState {
  return {
    tenant_id: tenantId,
    estado: 'aprobado',
    report_verification_status: 'verified',
    scoring_eligibility_status: 'not_eligible',
    subject_notice_required: false,
    subject_notice_status: 'waived',
    contradiction_status: 'none',
    ...overrides,
  };
}

async function synchronize(previousReport: ReportScoringState, updatedReport: ReportScoringState) {
  const calls: string[] = [];
  const changed = await synchronizeReportScoringParticipation({
    previousReport,
    updatedReport,
    tenantId,
    invalidateCurrentScore: async (id) => { calls.push(`invalidate:${id}`); },
    recalculateScore: async (id) => { calls.push(`recalculate:${id}`); },
  });
  return { changed, calls };
}

test('not_eligible -> eligible invalida antes de recalcular el score actual', async () => {
  const result = await synchronize(report(), report({ scoring_eligibility_status: 'eligible' }));
  assert.equal(result.changed, true);
  assert.deepEqual(result.calls, [`invalidate:${tenantId}`, `recalculate:${tenantId}`]);
});

test('eligible -> not_eligible invalida antes de recalcular el score actual', async () => {
  const result = await synchronize(
    report({ scoring_eligibility_status: 'eligible' }),
    report({ scoring_eligibility_status: 'not_eligible' })
  );
  assert.equal(result.changed, true);
  assert.deepEqual(result.calls, [`invalidate:${tenantId}`, `recalculate:${tenantId}`]);
});

test('un cambio sin alterar la participacion efectiva no toca el score persistido', async () => {
  const result = await synchronize(
    report({ scoring_eligibility_status: 'eligible', contradiction_status: 'rejected' }),
    report({ scoring_eligibility_status: 'eligible', contradiction_status: 'expired' })
  );
  assert.equal(result.changed, false);
  assert.deepEqual(result.calls, []);
});
