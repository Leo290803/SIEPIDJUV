export const modalityKey = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const classification = category => category.classification || (category.type === 'Equipe' ? 'Coletiva' : 'Individual');
// A relay is a proof within its modality; it never changes modality classification.
export function validateParticipation(event, drafts, candidate, {athletes = []} = {}) {
  const issues = [];
  const categories = event.categories || [];
  const current = categories.find(c => c.id === candidate.categoryId);
  if (!current) return ['Selecione uma categoria disponível.'];
  const entries = [...drafts.filter(d => d.eventId === event.id && d.id !== candidate.id && !['Cancelada', 'Indeferida'].includes(d.status)), candidate];
  const rules = (event.validationRules || []).filter(r => r.enabled !== false);
  const scopedRules = rules.filter(r => r.categoryId === current.id && (!r.proofId || (candidate.proofIds || []).includes(r.proofId)));
  for (const rule of scopedRules) {
    if (rule.kind === 'roster' || rule.kind === 'staffLimits') {
      const count = new Set((rule.kind === 'roster' ? candidate.athleteIds : candidate.staffIds) || []).size;
      const label = rule.kind === 'roster' ? 'atletas' : 'profissionais';
      if (rule.min != null && count < rule.min) issues.push(`Mínimo de ${label} por inscrição: ${rule.min}. Selecionados: ${count}.`);
      if (rule.max != null && count > rule.max) issues.push(`Máximo de ${label} por inscrição: ${rule.max}. Selecionados: ${count}.`);
    }
    if (rule.kind === 'schoolEntries') {
      const count = entries.filter(d => d.schoolId === candidate.schoolId && d.categoryId === current.id && (!rule.proofId || (d.proofIds || []).includes(rule.proofId))).length;
      if (rule.max != null && count > rule.max) issues.push(`Máximo de inscrições por escola em ${current.modality} / ${current.name}${rule.proofId?' na prova selecionada':''}: ${rule.max}. Encontradas: ${count}.`);
    }
  }
  for (const athleteId of candidate.athleteIds || []) {
    const own = entries.filter(d => (d.athleteIds || []).includes(athleteId));
    const modalities = new Map();
    for (const d of own) {
      const c = categories.find(row => row.id === d.categoryId);
      if (c) modalities.set(modalityKey(c.modality), classification(c));
    }
    for (const rule of rules) {
      if (rule.kind === 'age' && scopedRules.includes(rule)) {
        const athlete = athletes.find(a => a.id === athleteId);
        const birth = athlete?.birth;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(birth || '') ? new Date(birth+'T00:00:00Z') : null;
        if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==birth) {
          issues.push(`${athleteId}|Informe uma data de nascimento válida para verificar a idade.`);
        } else if (!rule.referenceDate || birth > rule.referenceDate) {
          issues.push(`${athleteId}|Nascimento posterior à data de referência da regra ou referência inválida.`);
        } else {
          const [year,month,day] = birth.split('-').map(Number);
          const [refYear,refMonth,refDay] = rule.referenceDate.split('-').map(Number);
          const age = refYear-year-((refMonth<month || (refMonth===month && refDay<day))?1:0);
          if ((rule.min != null && age < rule.min) || (rule.max != null && age > rule.max)) issues.push(`${athleteId}|Idade de ${age} anos em ${rule.referenceDate.split('-').reverse().join('/')}. Faixa permitida: ${rule.min??'sem mínimo'} a ${rule.max??'sem máximo'} anos.`);
        }
      }
      if (rule.kind === 'athleteCategories') {
        const count = new Set(own.filter(d => { const c = categories.find(row => row.id === d.categoryId); return c && modalityKey(c.modality) === modalityKey(current.modality); }).map(d=>d.categoryId)).size;
        if (rule.max != null && count > rule.max) issues.push(`${athleteId}|Máximo de categorias na modalidade ${current.modality}: ${rule.max}. Encontradas: ${count}.`);
      }
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
