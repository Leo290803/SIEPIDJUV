import { registrationStatusLabel } from "../data/peopleMapping.js";
export const REPORT_TYPES = {
  registrations: { label: "Inscrições", hint: "Uma linha por inscrição. Sexo, nascimento e foto filtram os atletas do elenco; a contagem indica os atletas encontrados no filtro." },
  participants: { label: "Atletas nas inscrições", hint: "Uma linha por atleta em cada inscrição, categoria ou prova. Pessoas distintas são contadas separadamente das linhas." },
  athletes: { label: "Cadastro de atletas", hint: "Uma linha por cadastro/escola. Ao filtrar evento, categoria ou situação de inscrição, aparecem somente cadastros com inscrições relacionadas." },
  staff: { label: "Cadastro da comissão técnica", hint: "Uma linha por profissional/escola. Os filtros do evento consideram a comissão efetivamente relacionada às inscrições." },
  staffEntries: { label: "Comissão técnica nas inscrições", hint: "Uma linha por profissional em cada inscrição. O filtro por sexo considera o profissional, não os atletas da equipe." },
  responsibles: { label: "Responsáveis escolares", hint: "Uma linha por responsável/escola. Filtros de evento e inscrição selecionam responsáveis das escolas participantes; não representam uma inscrição pessoal no evento." },
  schools: { label: "Escolas e inscrições", hint: "Uma linha por escola. Contagens de pessoas são de atletas distintos nos filtros selecionados." },
  events: { label: "Eventos e inscrições", hint: "Uma linha por evento. Escola, sexo, modalidade, categoria e período consideram as inscrições relacionadas." },
};
export const DEFAULT_FILTERS = { type: "participants", eventId: "", schoolId: "", city: "", modalityId: "", categoryId: "", proofId: "", gender: "", status: "", profileStatus: "", photo: "", from: "", to: "", yearFrom: "", yearTo: "", query: "", includeArchived: false };
export const PROFILE_TYPES = ["athletes", "staff", "responsibles"];
export const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const unique = values => [...new Set(values.filter(value => value != null && value !== ""))];
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
export function localDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export const dateLabel = value => { const iso = /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : localDate(value); return iso ? iso.split("-").reverse().join("/") : "Não informado"; };
export function validateFilters(filters) {
  if (filters.from && filters.to && filters.from > filters.to) return "A data inicial não pode ser posterior à data final.";
  for (const value of [filters.yearFrom, filters.yearTo]) if (value && (!/^\d{4}$/.test(String(value)) || Number(value) < 1900 || Number(value) > new Date().getFullYear())) return "Informe anos de nascimento entre 1900 e o ano atual.";
  if (filters.yearFrom && filters.yearTo && Number(filters.yearFrom) > Number(filters.yearTo)) return "O ano inicial de nascimento não pode ser maior que o final.";
  return "";
}
export function filterOptions(events, schools, filters) {
  const scoped = events.filter(e => !filters.eventId || e.id === filters.eventId);
  const modalities = scoped.flatMap(e => (e.modalities || []).map(m => ({ id: m.id, label: m.name + (filters.eventId ? "" : ` · ${e.name} (${e.year})`) })));
  const categories = scoped.flatMap(e => (e.categories || []).filter(c => !filters.modalityId || c.modalityId === filters.modalityId).map(c => ({ id: c.id, label: `${c.modality} · ${c.name}` + (filters.eventId ? "" : ` · ${e.name}`), eventId: e.id })));
  const allowedCategories = new Set(categories.filter(c => !filters.categoryId || c.id === filters.categoryId).map(c => c.id));
  const proofs = scoped.flatMap(e => (e.categories || []).filter(c => allowedCategories.has(c.id)).flatMap(c => (c.proofs || []).map(p => ({ id: p.id, label: `${c.name} · ${p.name}` }))));
  return { modalities, categories, proofs, cities: unique(schools.map(s => s.city)).sort(collator.compare) };
}
const C = (key, label, visible = true, group = false) => ({ key, label, visible, group });
const personColumns = [C("name", "Nome"), C("gender", "Sexo", true, true), C("birth", "Nascimento", false), C("birthYear", "Ano de nascimento", false), C("cpf", "CPF", false), C("phone", "Telefone", false), C("email", "E-mail", false)];
const schoolColumns = [C("school", "Escola", true, true), C("city", "Município", false, true)];
const contextColumns = [C("event", "Evento"), C("edition", "Edição", false), C("modality", "Modalidade", true, true), C("category", "Categoria", true, true), C("proof", "Prova", false, true), C("status", "Situação da inscrição", true, true), C("created", "Inscrição criada em", false)];
export function columnsFor(type, subjectFilter = false) {
  if (type === "participants") return [...personColumns, ...schoolColumns, ...contextColumns, C("slot", "Vaga", false), C("photo", "Foto", false, true)];
  if (type === "staffEntries") return [...personColumns, C("position", "Função"), ...schoolColumns, ...contextColumns, C("photo", "Foto", false, true)];
  if (PROFILE_TYPES.includes(type)) return [...personColumns, ...schoolColumns, ...(type !== "athletes" ? [C("position", "Cargo / função")] : []), C("status", "Situação do cadastro", true, true), C("photo", "Foto", false, true), C("relatedEvents", "Eventos relacionados", false), C("relatedCategories", "Categorias relacionadas", false)];
  if (type === "registrations") return [...schoolColumns, ...contextColumns, C("athletes", subjectFilter ? "Atletas no filtro" : "Atletas"), C("totalAthletes", "Total do elenco", false), C("athleteNames", "Nomes dos atletas no filtro", false), C("gender", "Sexos no resultado", false), C("reference", "ID da inscrição", false)];
  if (type === "schools") return [C("school", "Escola"), C("city", "Município", true, true), C("inep", "INEP"), C("registrations", "Inscrições"), C("people", "Atletas distintos"), C("male", "Atletas masculinos"), C("female", "Atletas femininos"), C("status", "Situação da escola", false, true)];
  return [C("event", "Evento"), C("edition", "Edição"), C("status", "Situação do evento", true, true), C("start", "Início das inscrições", false), C("end", "Fim das inscrições", false), C("schools", "Escolas participantes"), C("registrations", "Inscrições"), C("people", "Atletas distintos")];
}
export function buildReport({ data, events, schools }, input = {}) {
  const f = { ...DEFAULT_FILTERS, ...input };
  if (!REPORT_TYPES[f.type]) f.type = DEFAULT_FILTERS.type;
  const error = validateFilters(f);
  const schoolMap = new Map(schools.map(s => [s.id, s])), eventMap = new Map(events.map(e => [e.id, e]));
  const people = new Map();
  for (const record of [...(data.athletes || []), ...(data.staff || []), ...(data.responsibles || [])]) if (!people.has(record.personId)) people.set(record.personId, record);
  const personFor = id => people.get(id);
  const subjectFilter = !!(f.gender || f.yearFrom || f.yearTo || f.photo);
  const registrationContext = !!(f.eventId || f.modalityId || f.categoryId || f.proofId || f.status || f.from || f.to);
  const personMatches = p => {
    if (!p) return !subjectFilter;
    if (f.gender && (p.gender || "unknown") !== f.gender) return false;
    const year = Number((p.birth || "").slice(0, 4));
    if (f.yearFrom && (!year || year < Number(f.yearFrom))) return false;
    if (f.yearTo && (!year || year > Number(f.yearTo))) return false;
    if (f.photo === "with" && !p.photo) return false;
    if (f.photo === "without" && p.photo) return false;
    return true;
  };
  const contexts = new Map(), allocationsByRegistration = new Map(), staffByRegistration = new Map();
  for (const allocation of data.allocations || []) {
    if (!allocationsByRegistration.has(allocation.registration_id)) allocationsByRegistration.set(allocation.registration_id, []);
    allocationsByRegistration.get(allocation.registration_id).push(allocation);
  }
  for (const assignment of data.registrationStaff || []) {
    if (!staffByRegistration.has(assignment.registration_id)) staffByRegistration.set(assignment.registration_id, []);
    staffByRegistration.get(assignment.registration_id).push(assignment);
  }
  const context = r => {
    if (contexts.has(r.id)) return contexts.get(r.id);
    const event = eventMap.get(r.event_id), school = schoolMap.get(r.school_id), category = event?.categories?.find(c => c.id === r.category_id), proof = category?.proofs?.find(p => p.id === r.proof_id);
    const result = { event, school, category, proof, cells: { event: event?.name || "Evento não disponível", edition: event?.year || "", school: school?.name || "Escola não disponível", city: school?.city || "Não informado", modality: category?.modality || "Não informado", category: category?.name || "Não informado", proof: proof?.name || "Sem prova", status: registrationStatusLabel[r.status] || "Não informado", created: dateLabel(r.created_at), reference: r.id } };
    contexts.set(r.id, result);
    return result;
  };
  const baseRegistrations = (data.registrations || []).filter(r => {
    const c = context(r), date = localDate(r.created_at);
    return (!f.eventId || r.event_id === f.eventId) && (!f.schoolId || r.school_id === f.schoolId) && (!f.city || c.school?.city === f.city) && (!f.modalityId || c.category?.modalityId === f.modalityId) && (!f.categoryId || r.category_id === f.categoryId) && (!f.proofId || r.proof_id === f.proofId) && (!f.status || r.status === f.status) && (!f.from || date && date >= f.from) && (!f.to || date && date <= f.to);
  });
  const allocationsFor = r => (allocationsByRegistration.get(r.id) || []).filter(a => a.active !== false || ["cancelled", "rejected"].includes(r.status));
  const matchesFor = r => allocationsFor(r).filter(a => personMatches(personFor(a.person_id)));
  const filteredRegistrations = baseRegistrations.filter(r => !subjectFilter || matchesFor(r).length);
  const personCells = p => ({ name: p?.name || "Pessoa não disponível", gender: p?.gender || "Não informado", birth: dateLabel(p?.birth), birthYear: p?.birth?.slice(0, 4) || "Não informado", cpf: p?.cpf || "", phone: p?.phone || "", email: p?.email || "", photo: p?.photo ? "Com foto" : "Sem foto" });
  const row = (key, cells, personIds = [], schoolIds = [], registrationIds = []) => ({ key, cells, personIds: unique(personIds), schoolIds: unique(schoolIds), registrationIds: unique(registrationIds) });
  let rows = [];
  if (f.type === "registrations") rows = filteredRegistrations.map(r => {
    const matched = matchesFor(r), persons = matched.map(a => personFor(a.person_id));
    return row(r.id, { ...context(r).cells, athletes: matched.length, totalAthletes: allocationsFor(r).length, athleteNames: unique(persons.map(p => p?.name)).join("; "), gender: unique(persons.map(p => p?.gender || "Não informado")).join(" / ") || "Sem atletas" }, matched.map(a => a.person_id), [r.school_id], [r.id]);
  });
  else if (f.type === "participants") rows = baseRegistrations.flatMap(r => matchesFor(r).map((a, i) => row(a.id || `${r.id}:${a.person_id}:${i}`, { ...personCells(personFor(a.person_id)), ...context(r).cells, slot: a.slot_number }, [a.person_id], [r.school_id], [r.id])));
  else if (f.type === "staffEntries") rows = baseRegistrations.flatMap(r => (staffByRegistration.get(r.id) || []).filter(a => personMatches(personFor(a.person_id))).map((a, i) => row(a.id || `${r.id}:${a.person_id}:${i}`, { ...personCells(personFor(a.person_id)), ...context(r).cells, position: context(r).event?._staffRoles?.find(role => role.id === a.staff_role_id)?.name || personFor(a.person_id)?.position || "Não informado" }, [a.person_id], [r.school_id], [r.id])));
  else if (PROFILE_TYPES.includes(f.type)) rows = (data[f.type] || []).filter(p => (f.includeArchived || !p.archived) && (!f.profileStatus || p.status === f.profileStatus) && (!f.schoolId || p.schoolId === f.schoolId) && (!f.city || schoolMap.get(p.schoolId)?.city === f.city) && personMatches(p)).flatMap(p => {
    const related = baseRegistrations.filter(r => r.school_id === p.schoolId && (f.type === "responsibles" || (f.type === "athletes" ? allocationsFor(r) : staffByRegistration.get(r.id) || []).some(a => a.registration_id === r.id && a.person_id === p.personId)));
    if (registrationContext && !related.length) return [];
    const school = schoolMap.get(p.schoolId);
    return [row(p.id, { ...personCells(p), school: school?.name || "Escola não disponível", city: school?.city || "Não informado", position: p.position || "Não informado", status: p.status || "Não informado", relatedEvents: unique(related.map(r => context(r).cells.event)).join("; "), relatedCategories: unique(related.map(r => context(r).cells.category)).join("; ") }, [p.personId], [p.schoolId], related.map(r => r.id))];
  });
  else if (f.type === "schools") rows = schools.filter(s => (!f.schoolId || s.id === f.schoolId) && (!f.city || s.city === f.city) && (f.includeArchived || !s.archived)).flatMap(s => {
    const registrations = filteredRegistrations.filter(r => r.school_id === s.id), allocations = registrations.flatMap(matchesFor), ids = unique(allocations.map(a => a.person_id));
    if ((registrationContext || subjectFilter) && !registrations.length) return [];
    return [row(s.id, { school: s.name, city: s.city || "Não informado", inep: s.inep || "", registrations: registrations.length, people: ids.length, male: ids.filter(id => personFor(id)?.gender === "Masculino").length, female: ids.filter(id => personFor(id)?.gender === "Feminino").length, status: s.archived ? "Arquivada" : "Ativa" }, ids, [s.id], registrations.map(r => r.id))];
  });
  else rows = events.filter(e => (!f.eventId || e.id === f.eventId) && (f.includeArchived || e.status !== "Arquivado")).flatMap(e => {
    const registrations = filteredRegistrations.filter(r => r.event_id === e.id), ids = unique(registrations.flatMap(matchesFor).map(a => a.person_id));
    if ((f.schoolId || f.city || f.modalityId || f.categoryId || f.proofId || f.status || f.from || f.to || subjectFilter) && !registrations.length) return [];
    return [row(e.id, { event: e.name, edition: e.year, status: e.status, start: dateLabel(e.start), end: dateLabel(e.end), schools: unique(registrations.map(r => r.school_id)).length, registrations: registrations.length, people: ids.length }, ids, registrations.map(r => r.school_id), registrations.map(r => r.id))];
  });
  if (f.query.trim()) {
    const q = normalize(f.query.trim()), digits = /^[\d.\-\s]+$/.test(q) ? q.replace(/\D/g, "") : "";
    rows = rows.filter(r => normalize(Object.values(r.cells).join(" ")).includes(q) || digits && String(r.cells.cpf || "").includes(digits));
  }
  if (error) rows = [];
  const summary = summarize(rows);
  return { type: f.type, title: REPORT_TYPES[f.type].label, hint: REPORT_TYPES[f.type].hint, rows, columns: columnsFor(f.type, subjectFilter), summary, error };
}
export function summarize(rows) {
  return { records: rows.length, people: unique(rows.flatMap(r => r.personIds)).length, schools: unique(rows.flatMap(r => r.schoolIds)).length, registrations: unique(rows.flatMap(r => r.registrationIds)).length };
}
export function sortRows(rows, key, direction = "asc") {
  const value = row => {
    const text = String(row.cells[key] ?? "");
    return ["birth", "created", "start", "end"].includes(key) && /^\d{2}\/\d{2}\/\d{4}$/.test(text) ? text.split("/").reverse().join("-") : text;
  };
  return [...rows].sort((a, b) => (collator.compare(value(a), value(b)) || collator.compare(a.key, b.key)) * (direction === "desc" ? -1 : 1));
}
export function groupRows(rows, key) {
  const groups = new Map();
  for (const r of rows) { const value = String(r.cells[key] ?? "Não informado"); if (!groups.has(value)) groups.set(value, []); groups.get(value).push(r); }
  return [...groups].sort(([a], [b]) => collator.compare(a, b)).map(([name, list]) => { const s = summarize(list); return { key: name, cells: { name, records: s.records, people: s.people, schools: s.schools, registrations: s.registrations } }; });
}
export const GROUP_COLUMNS = [C("name", "Grupo"), C("records", "Linhas"), C("people", "Pessoas distintas"), C("schools", "Escolas"), C("registrations", "Inscrições")];
export function describeFilters(events, schools, f) {
  const options = filterOptions(events, schools, f), labels = [];
  const add = (label, value) => { if (value) labels.push(`${label}: ${value}`); };
  add("Evento", f.eventId && events.find(e => e.id === f.eventId)?.name);
  add("Escola", f.schoolId && schools.find(s => s.id === f.schoolId)?.name);
  add("Município", f.city); add("Modalidade", f.modalityId && options.modalities.find(m => m.id === f.modalityId)?.label); add("Categoria", f.categoryId && options.categories.find(c => c.id === f.categoryId)?.label); add("Prova", f.proofId && options.proofs.find(p => p.id === f.proofId)?.label);
  add("Sexo", f.gender === "unknown" ? "Não informado" : f.gender); add("Situação da inscrição", registrationStatusLabel[f.status]); add("Situação do cadastro", PROFILE_TYPES.includes(f.type) && f.profileStatus);
  add("Inscrições criadas de", f.from && dateLabel(f.from)); add("Inscrições criadas até", f.to && dateLabel(f.to)); add("Nascimento a partir de", f.yearFrom); add("Nascimento até", f.yearTo); add("Foto", f.photo === "with" ? "Com foto" : f.photo === "without" ? "Sem foto" : ""); add("Pesquisa", f.query.trim());
  if (f.includeArchived && [...PROFILE_TYPES, "schools", "events"].includes(f.type)) labels.push("Inclui cadastros arquivados");
  return labels.length ? labels : ["Sem filtros adicionais"];
}
