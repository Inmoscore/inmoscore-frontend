export const SCORE_CONFIG = {
  VERSION: 'v1.0',

  BASE_SCORE: 10000, // 100.00

  // Penalización por tipo de problema
  PROBLEM_WEIGHTS: {
    late_payment_minor: 1000,
    non_payment_relevant: 2000,
    non_payment_severe: 3000,

    property_damage_minor: 1000,
    property_damage_major: 2200,
    property_damage_severe: 3500,

    coexistence_issue: 1200,
    unauthorized_use: 1800,

    document_fraud: 4500,
    judicial_process: 4000,
  },

  // Multiplicadores de recurrencia (%)
  RECURRENCE: [100, 70, 50, 30],

  // Multiplicadores por antigüedad (meses)
  RECENCY: [
    { months: 12, factor: 100 },
    { months: 24, factor: 75 },
    { months: 36, factor: 50 },
    { months: 999, factor: 25 },
  ],

  // Ajustes adicionales
  ADJUSTMENTS: {
    MULTI_REPORTERS: {
      2: 400,
      3: 800,
    },
    CATEGORY_DIVERSITY: {
      2: 500,
      3: 1000,
    },
    VOLUME: {
      2: 300,
      3: 600,
      4: 1000,
    },
  },

  // Clasificación
  CLASSIFICATION: [
    { min: 8500, level: 'low' },
    { min: 7000, level: 'medium' },
    { min: 5000, level: 'high' },
    { min: 0, level: 'critical' },
  ],

  // Overrides (reglas duras)
  OVERRIDES: {
    FRAUD_MIN: 'high',
    JUDICIAL_MIN: 'high',
    MULTIPLE_SEVERE: 'critical',
  },
} as const;