import { SCORE_CONFIG } from '../core/config';
import { mapProblemType } from '../core/typeMapping';

type Report = {
  tipo_problema: string;
  fecha_reporte: string;
  reportado_por?: string | null;
};

type ScoreFactor = {
  type: string;
  baseWeight: number;
  recurrenceFactor: number;
  recencyFactor: number;
  penalty: number;
};

type ScoreResult = {
  score: number;
  score_normalized: number;
  classification: string;
  factors: ScoreFactor[];
  total_reports: number;
};

export function calculateScore(reports: Report[]): ScoreResult {
  let score: number = SCORE_CONFIG.BASE_SCORE;

  if (!reports || reports.length === 0) {
    return buildResult(score, [], []);
  }

  const grouped: Record<string, Report[]> = {};

  for (const report of reports) {
    const mappedType = mapProblemType(report.tipo_problema);

    if (!grouped[mappedType]) {
      grouped[mappedType] = [];
    }

    grouped[mappedType].push(report);
  }

  let totalPenalty = 0;
  const factors: ScoreFactor[] = [];

  for (const type in grouped) {
    const reportsOfType = grouped[type];

    reportsOfType.sort(
      (a, b) =>
        new Date(b.fecha_reporte).getTime() -
        new Date(a.fecha_reporte).getTime()
    );

    for (let i = 0; i < reportsOfType.length; i++) {
      const report = reportsOfType[i];

      const baseWeight =
        SCORE_CONFIG.PROBLEM_WEIGHTS[
          type as keyof typeof SCORE_CONFIG.PROBLEM_WEIGHTS
        ] || 0;

      const recurrenceFactor =
        SCORE_CONFIG.RECURRENCE[
          Math.min(i, SCORE_CONFIG.RECURRENCE.length - 1)
        ];

      const monthsDiff = getMonthsDiff(report.fecha_reporte);
      const recencyFactor = getRecencyFactor(monthsDiff);

      const penalty = Math.round(
        (baseWeight * recurrenceFactor * recencyFactor) / 100 / 100
      );

      totalPenalty += penalty;

      factors.push({
        type,
        baseWeight,
        recurrenceFactor,
        recencyFactor,
        penalty,
      });
    }
  }

  score = Math.max(0, score - totalPenalty);

  return buildResult(score, factors, reports);
}

function getMonthsDiff(dateString: string): number {
  const now = new Date();
  const date = new Date(dateString);

  const months =
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());

  return Math.max(0, months);
}

function getRecencyFactor(months: number): number {
  for (const r of SCORE_CONFIG.RECENCY) {
    if (months <= r.months) {
      return r.factor;
    }
  }

  return 25;
}

function buildResult(
  score: number,
  factors: ScoreFactor[],
  reports: Report[]
): ScoreResult {
  const classification = getClassification(score);

  return {
    score,
    score_normalized: score / 100,
    classification,
    factors,
    total_reports: reports.length,
  };
}

function getClassification(score: number): string {
  for (const c of SCORE_CONFIG.CLASSIFICATION) {
    if (score >= c.min) {
      return c.level;
    }
  }

  return 'critical';
}
