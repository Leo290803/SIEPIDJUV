export const modalityKey = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const classification = category => category.classification || (category.type === 'Equipe' ? 'Coletiva' : 'Individual');
// A relay is a proof within its modality; it never changes modality classification.
export function validateParticipation(event, drafts, candidate) {
  const issues = [];
  const categories = event.categories || [];
  const current = categories.find(c => c.id === candidate.categoryId);
  if (!current) return ['Selecione uma categoria disponível.'];
  const entries = [...drafts.filter(d => d.eventId === event.id && d.id !== candidate.id && !['Cancelada', 'Indeferida'].includes(d.status)), candidate];
  const rules = (event.validationRules || []).filter(r => r.enabled !== false);
  for (const athleteId of candidate.athleteIds || []) {
    const own = entries.filter(d => (d.athleteIds || []).includes(athleteId));
    const modalities = new Map();
    for (const d of own) {
      const c = categories.find(row => row.id === d.categoryId);
      if (c) modalities.set(modalityKey(c.modality), classification(c));
    }
    for (const rule of rules) {
      if (rule.kind === 'modalities') {
        const counts = {total: modalities.size, individual: [...modalities.values()].filter(v => v === 'Individual').length, collective: [...modalities.values()].filter(v => v === 'Coletiva').length};
        for (const [key, label] of [['total','modalidades no evento'],['individual','modalidades individuais'],['collective','modalidades coletivas']]) {
          if (rule[key] != null && counts[key] > rule[key]) issues.push(`${athleteId}|Limite de ${label}: ${rule[key]}. Participações encontradas: ${counts[key]}.`);
        }
      }
      if (rule.kind === 'proofs' && current.id === rule.categoryId) {
        const proofs = new Map();
        for (const d of own.filter(d => d.categoryId === rule.categoryId)) {
          for (const id of d.proofIds || []) {
            const proof = (current.proofs || []).find(p => p.id === id);
            if (proof) proofs.set(id, proof.type);
          }
        }
        for (const [key, type, label] of [['individual','Individual','provas individuais'],['relay','Revezamento','revezamentos']]) {
          const count = [...proofs.values()].filter(v => v === type).length;
          if (rule[key] != null && count > rule[key]) issues.push(`${athleteId}|Limite de ${label} em ${current.modality} / ${current.name}: ${rule[key]}. Selecionadas: ${count}.`);
        }
      }
      if (rule.kind === 'proofEntries' && current.id === rule.categoryId && (candidate.proofIds || []).includes(rule.proofId)) {
        const count = own.filter(d => d.categoryId === rule.categoryId && (d.proofIds || []).includes(rule.proofId)).length;
        if (rule.max != null && count > rule.max) issues.push(`${athleteId}|Limite de inscrições na mesma prova: ${rule.max}. Encontradas: ${count}.`);
      }
    }
  }
  return [...new Set(issues)];
}
