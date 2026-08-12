import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSearchResponseError,
  getSearchResultPresentation,
  INSUFFICIENT_INFORMATION_CAUTION,
  INSUFFICIENT_INFORMATION_TITLE,
} from './searchPresentation.ts';

const productionInsufficientDataFixture = {
  success: true,
  cedula: '4558503',
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
  score_version: 'v1.0',
  score_explanation: {
    score: null,
    classification: null,
    summary: 'No hay suficiente información para explicar un score calculado de forma confiable.',
    factors: [
      {
        key: 'no_negative_signals_found',
        label: 'Sin señales negativas verificadas',
        direction: 'positive',
        severity: 'low',
        description:
          'No se encontraron reportes aprobados ni señales judiciales verificadas con impacto en el modelo actual.',
        impacts_score: false,
        disputed: false,
        pending_legal_review: false,
      },
    ],
    legal_caution_required: false,
    human_review_recommended: true,
  },
  rental_history_summary: {
    total_verified: 0,
  },
  rental_histories: [],
  rental_history_locked: false,
  rental_history_detail_level: 'none',
  rental_history_message: 'No se encontró historial',
  plan_type: 'free',
  daily_limit: 3,
  used_searches: 1,
  remaining_searches: 2,
  bonus_credits_available: 2,
  bonus_credit_used: false,
};

test('keeps an existing score in the scored presentation flow', () => {
  const presentation = getSearchResultPresentation({
    success: true,
    score: 82,
    reportes_aprobados: 1,
    procesos_judiciales: 0,
  });

  assert.deepEqual(presentation, { kind: 'scored' });
});

test('routes the exact production null-score payload to insufficient-data', () => {
  const presentation = getSearchResultPresentation(productionInsufficientDataFixture);

  assert.equal(presentation.kind, 'insufficient-data');
  if (presentation.kind !== 'insufficient-data') return;
  assert.equal(presentation.title, INSUFFICIENT_INFORMATION_TITLE);
  assert.equal(
    presentation.summary,
    productionInsufficientDataFixture.score_explanation.summary
  );
  assert.equal(presentation.scoreText, 'Score: No disponible');
  assert.equal(presentation.caution, INSUFFICIENT_INFORMATION_CAUTION);
  assert.equal(presentation.reportesAprobados, 0);
  assert.equal(presentation.procesosJudiciales, 0);
  assert.equal(presentation.historialVerificado, 0);
  assert.equal(presentation.humanReviewRecommended, true);
  assert.deepEqual(
    presentation.factors,
    productionInsufficientDataFixture.score_explanation.factors
  );
  assert.equal(presentation.factors[0].impacts_score, false);
});

test('returns the API message for HTTP and API errors', () => {
  assert.equal(
    getSearchResponseError(false, { message: 'Servicio temporalmente no disponible' }),
    'Servicio temporalmente no disponible'
  );
  assert.equal(
    getSearchResponseError(true, { success: false, message: 'Consulta rechazada' }),
    'Consulta rechazada'
  );
});
