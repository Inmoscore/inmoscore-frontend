import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSearchResponseError,
  getSearchResultPresentation,
  INSUFFICIENT_INFORMATION_CAUTION,
  INSUFFICIENT_INFORMATION_TITLE,
} from './searchPresentation.ts';

test('keeps an existing score in the scored presentation flow', () => {
  const presentation = getSearchResultPresentation({
    success: true,
    score: 82,
    reportes_aprobados: 1,
    procesos_judiciales: 0,
  });

  assert.deepEqual(presentation, { kind: 'scored' });
});

test('presents a successful null score as insufficient information', () => {
  const factors = [
    {
      key: 'limited_history',
      label: 'Historial limitado',
      description: 'Solo hay una señal informativa.',
      impacts_score: false,
    },
  ];
  const presentation = getSearchResultPresentation({
    success: true,
    score: null,
    reportes_aprobados: 2,
    procesos_judiciales: 1,
    rental_history_summary: { total_verified: 3 },
    score_explanation: {
      summary: 'Faltan señales verificadas suficientes para calcular el score.',
      human_review_recommended: true,
      factors,
    },
  });

  assert.equal(presentation.kind, 'insufficient');
  if (presentation.kind !== 'insufficient') return;
  assert.equal(presentation.title, INSUFFICIENT_INFORMATION_TITLE);
  assert.equal(presentation.summary, 'Faltan señales verificadas suficientes para calcular el score.');
  assert.equal(presentation.scoreText, 'Score: No disponible');
  assert.equal(presentation.caution, INSUFFICIENT_INFORMATION_CAUTION);
  assert.equal(presentation.reportesAprobados, 2);
  assert.equal(presentation.procesosJudiciales, 1);
  assert.equal(presentation.historialVerificado, 3);
  assert.equal(presentation.humanReviewRecommended, true);
  assert.deepEqual(presentation.factors, factors);
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
