export type ProblemType =
  | 'late_payment_minor'
  | 'non_payment_relevant'
  | 'non_payment_severe'
  | 'property_damage_minor'
  | 'property_damage_major'
  | 'property_damage_severe'
  | 'coexistence_issue'
  | 'unauthorized_use'
  | 'document_fraud'
  | 'judicial_process';

export function mapProblemType(tipo: string): ProblemType {
  const t = String(tipo || '').toLowerCase().trim();

  // =========================
  // NUEVAS CATEGORÍAS EXACTAS
  // =========================
  if (t === 'mora_leve') {
    return 'late_payment_minor';
  }

  if (t === 'impago_relevante') {
    return 'non_payment_relevant';
  }

  if (t === 'impago_severo') {
    return 'non_payment_severe';
  }

  if (t === 'danos_menores') {
    return 'property_damage_minor';
  }

  if (t === 'danos_relevantes') {
    return 'property_damage_major';
  }

  if (t === 'danos_severos') {
    return 'property_damage_severe';
  }

  if (t === 'convivencia') {
    return 'coexistence_issue';
  }

  if (t === 'uso_no_autorizado') {
    return 'unauthorized_use';
  }

  if (t === 'fraude_documental') {
    return 'document_fraud';
  }

  if (t === 'desalojo') {
    return 'judicial_process';
  }

  // =========================
  // COMPATIBILIDAD CON DATOS VIEJOS
  // =========================
  if (t.includes('impago') || t.includes('mora')) {
    return 'non_payment_relevant';
  }

  if (
    t.includes('daño') ||
    t.includes('daño') ||
    t.includes('daños') ||
    t.includes('danos')
  ) {
    return 'property_damage_major';
  }

  if (t.includes('ruido') || t.includes('convivencia')) {
    return 'coexistence_issue';
  }

  if (t.includes('fraude')) {
    return 'document_fraud';
  }

  if (t.includes('desalojo') || t.includes('judicial')) {
    return 'judicial_process';
  }

  if (t.includes('otros')) {
    return 'coexistence_issue';
  }

  // fallback seguro
  return 'coexistence_issue';
}