export const INSUFFICIENT_INFORMATION_TITLE =
  'Información insuficiente para calcular un InmoScore';

export const INSUFFICIENT_INFORMATION_CAUTION =
  'La ausencia de información no equivale a ausencia de riesgo';

type SearchPresentationInput<TFactor> = {
  success: boolean;
  nombre?: string | null;
  score: number | null;
  reportes_aprobados: number;
  procesos_judiciales: number;
  rental_history_summary?: {
    total_verified: number;
  };
  score_explanation?: {
    summary: string;
    factors: TFactor[];
    human_review_recommended: boolean;
  };
};

export type InsufficientDataPresentation<TFactor> = {
  kind: 'insufficient-data';
  title: typeof INSUFFICIENT_INFORMATION_TITLE;
  summary: string;
  scoreText: 'Score: No disponible';
  caution: typeof INSUFFICIENT_INFORMATION_CAUTION;
  reportesAprobados: number;
  procesosJudiciales: number;
  historialVerificado: number;
  humanReviewRecommended: boolean;
  factors: TFactor[];
};

export type SearchResultPresentation<TFactor> =
  | { kind: 'scored' }
  | { kind: 'not-found' }
  | { kind: 'other' }
  | InsufficientDataPresentation<TFactor>;

export type SearchResultRenderDecision<TFactor> =
  | { kind: 'empty' }
  | { kind: 'not-found' }
  | {
      kind: 'insufficient-data';
      presentation: InsufficientDataPresentation<TFactor>;
    }
  | { kind: 'scored' }
  | { kind: 'other' };

type SearchResultRenderers<TFactor, TOutput> = {
  notFound: () => TOutput;
  insufficientData: (
    presentation: InsufficientDataPresentation<TFactor>
  ) => TOutput;
  scored: () => TOutput;
};

export function getSearchResultPresentation<TFactor>(
  result: SearchPresentationInput<TFactor>
): SearchResultPresentation<TFactor> {
  if (result.success === true && result.score === null) {
    return {
      kind: 'insufficient-data',
      title: INSUFFICIENT_INFORMATION_TITLE,
      summary:
        result.score_explanation?.summary ||
        'No hay suficiente información verificada para calcular el score.',
      scoreText: 'Score: No disponible',
      caution: INSUFFICIENT_INFORMATION_CAUTION,
      reportesAprobados: result.reportes_aprobados,
      procesosJudiciales: result.procesos_judiciales,
      historialVerificado: result.rental_history_summary?.total_verified ?? 0,
      humanReviewRecommended:
        result.score_explanation?.human_review_recommended === true,
      factors: result.score_explanation?.factors ?? [],
    };
  }

  if (result.nombre === null) {
    return { kind: 'not-found' };
  }

  if (result.score !== null) {
    return { kind: 'scored' };
  }

  return { kind: 'other' };
}

export function getSearchResultRenderDecision<TFactor>(
  result: SearchPresentationInput<TFactor> | null
): SearchResultRenderDecision<TFactor> {
  if (!result) return { kind: 'empty' };

  const presentation = getSearchResultPresentation(result);

  switch (presentation.kind) {
    case 'insufficient-data':
      return {
        kind: presentation.kind,
        presentation,
      };
    case 'not-found':
      return { kind: presentation.kind };
    case 'scored':
      return { kind: presentation.kind };
    case 'other':
      return { kind: presentation.kind };
  }
}

export function renderSearchResultDecision<TFactor, TOutput>(
  decision: SearchResultRenderDecision<TFactor>,
  renderers: SearchResultRenderers<TFactor, TOutput>
): TOutput | null {
  switch (decision.kind) {
    case 'not-found':
      return renderers.notFound();
    case 'insufficient-data':
      return renderers.insufficientData(decision.presentation);
    case 'scored':
      return renderers.scored();
    case 'empty':
    case 'other':
      return null;
  }
}

export function shouldScrollToSearchResult<TFactor>(
  decision: SearchResultRenderDecision<TFactor>
): boolean {
  return (
    decision.kind === 'scored' ||
    decision.kind === 'not-found' ||
    decision.kind === 'insufficient-data'
  );
}

export function shouldScrollAfterSearchResponse<TFactor>(
  responseOk: boolean,
  decision: SearchResultRenderDecision<TFactor>
): boolean {
  return responseOk && shouldScrollToSearchResult(decision);
}

export function getSearchResponseError(
  responseOk: boolean,
  data: { success?: boolean; message?: string }
): string | null {
  if (responseOk && data.success !== false) return null;
  return data.message || 'No se pudo completar la búsqueda';
}
