// Solicitações antigas são texto. Só cria atalhos quando o rótulo identifica
// exatamente uma pessoa/documento do elenco desta inscrição.
export function correctionItems(reason, registration, data, event) {
  const ids = new Set(data.allocations.filter(a => a.registration_id === registration.id && a.active !== false).map(a => a.person_id));
  const athletes = data.athletes.filter(p => ids.has(p.personId) && p.schoolId === registration.school_id);
  const labels = [];
  for (const athlete of athletes) {
    labels.push({label: athlete.name, athlete, documentId: null});
    for (const document of event?.requirements?.documents || []) {
      if (!document.categoryId || document.categoryId === registration.category_id)
        labels.push({label: `${athlete.name} — ${document.name}`, athlete, documentId: document.id});
    }
  }
  return String(reason || '').split(/\r?\n/).filter(line => line.trim()).map((text,index) => {
    const matches = labels.filter(target => text.startsWith(target.label + ':'));
    const target = matches.length === 1 ? matches[0] : null;
    return {id:index,text,target,message:target ? text.slice(target.label.length+1).trim() : text};
  });
}
export function correctionExpired(deadline, now = Date.now()) {
  const date = Date.parse(deadline);
  return Number.isFinite(date) && date <= now;
}
