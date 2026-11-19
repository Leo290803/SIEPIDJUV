import { registrationStatusLabel } from "../data/peopleMapping.js";
import { MAX_EXPORT_ROWS } from "./exportPages.js";
import { createReportPdf } from "./exportPdf.js";

const reportStatuses = new Set(["submitted", "correction_requested", "approved"]);

const registrationColumns = [
  { key: "category", label: "Categoria" },
  { key: "proof", label: "Prova" },
  { key: "status", label: "Situação" },
  { key: "deadline", label: "Prazo de correção" },
];

function genderFrom(...labels) {
  for (const label of labels) {
    const match = label?.match(/\b(feminino|masculino|misto)\b/i)?.[1].toLowerCase();
    if (match) return match[0].toUpperCase() + match.slice(1);
  }
}

function assignmentsByRegistration(assignments) {
  const index = new Map();
  for (const assignment of assignments) {
    const list = index.get(assignment.registration_id) || [];
    list.push(assignment);
    index.set(assignment.registration_id, list);
  }
  return index;
}

export async function createSchoolRegistrationsPdf({api, tenant, school, event, status, query, modalityId, signal}) {
  if (status !== "all" && !reportStatuses.has(status)) {
    throw Error("O PDF inclui apenas inscrições enviadas, em correção ou aprovadas. Altere o filtro de situação.");
  }
  const categories = new Map(event.categories.map(category => [category.id, category]));
  const roles = new Map((event._staffRoles || []).map(role => [role.id, role.name]));
  const seen = new Set();
  const modalities = new Map();
  const commission = new Map();
  let registrations = 0;
  const people = new Set();
  let total;
  do {
    signal.throwIfAborted();
    const page = await api.load(tenant, {
      mode: "registrations",
      schoolId: school.id,
      filters: {eventId:event.id,status,query},
      offset: seen.size,
      limit: 100,
    }, signal);
    signal.throwIfAborted();
    if ((total !== undefined && total !== page.total) || (!page.registrations.length && seen.size < page.total)) {
      throw Error("As inscrições mudaram durante a geração. Tente baixar o PDF novamente.");
    }
    total = page.total;
    if (total > MAX_EXPORT_ROWS) throw Error("Há muitas inscrições para um PDF. Filtre por situação e tente novamente.");

    const athletes = new Map(page.athletes.map(person => [person.personId, person]));
    const staff = new Map(page.staff.map(person => [person.personId, person.name]));
    const allocated = assignmentsByRegistration(page.allocations);
    const assigned = assignmentsByRegistration(page.registrationStaff);
    for (const registration of page.registrations) {
      if (registration.school_id !== school.id || registration.event_id !== event.id || seen.has(registration.id)) {
        throw Error("A consulta retornou inscrições fora do escopo do relatório ou repetidas. Tente novamente.");
      }
      seen.add(registration.id);
      if (!reportStatuses.has(registration.status)) continue;
      for (const {person_id,staff_role_id} of assigned.get(registration.id) || []) {
        people.add(person_id);
        if (!commission.has(person_id)) commission.set(person_id,{name:staff.get(person_id),roles:new Set()});
        const professional = commission.get(person_id);
        professional.name ||= staff.get(person_id);
        const role = roles.get(staff_role_id);
        if (role) professional.roles.add(role);
      }
      const category = categories.get(registration.category_id);
      if (modalityId && category?.modalityId !== modalityId) continue;
      registrations++;
      const modalityKey = category?.modalityId;
      if (!modalities.has(modalityKey)) {
        modalities.set(modalityKey, {title:category?.modality || "Modalidade indisponível",groups:new Map()});
      }
      const group = modalities.get(modalityKey);
      const proof = category?.proofs.find(item => item.id === registration.proof_id);
      const cells = {
        category: category?.name || "Categoria indisponível",
        proof: proof?.name || "—",
        status: registrationStatusLabel[registration.status] || registration.status,
        deadline: registration.status === "correction_requested" && registration.correction_deadline
          ? new Date(registration.correction_deadline).toLocaleString("pt-BR",{timeZone:"America/Manaus"})
          : "—",
      };
      const roster = (allocated.get(registration.id) || []).sort((a,b) => a.slot_number-b.slot_number);
      const registeredGender = genderFrom(proof?.gender,category?.gender,proof?.name,category?.name);
      const rosters = new Map();
      for (const {person_id} of roster) {
        people.add(person_id);
        const athlete = athletes.get(person_id);
        const gender = registeredGender || genderFrom(athlete?.gender) || "Sem naipe informado";
        const names = rosters.get(gender) || [];
        names.push(athlete?.name || "Nome indisponível");
        rosters.set(gender,names);
      }
      if (!rosters.size) rosters.set(registeredGender || "Sem naipe informado",[]);
      for (const [gender,names] of rosters) {
        const rows = group.groups.get(gender) || [];
        rows.push({cells:{...cells,names:names.join("\n") || "—"}});
        group.groups.set(gender,rows);
      }
    }
  } while (seen.size < total);

  if (!registrations) return null;
  const compare = (a,b) => a.localeCompare(b,"pt-BR");
  const byCategory = (a,b) => compare(a.cells.category,b.cells.category) || compare(a.cells.proof,b.cells.proof);
  const sections = [...modalities.values()].sort((a,b) => compare(a.title,b.title)).map(group => ({
    title: group.title,
    tables: [...group.groups].sort(([a],[b]) => compare(a,b)).map(([gender,rows]) => ({
      title:gender,
      columns:[...registrationColumns.slice(0,2),{key:"names",label:"Atletas inscritos"},...registrationColumns.slice(2)],
      rows:rows.sort(byCategory),
    })),
  }));
  const commissionRows = [...commission.values()].map(({name,roles}) => ({
    cells:{name:name || "Nome indisponível",role:[...roles].sort(compare).join(" / ") || "—"},
  })).sort((a,b) => compare(a.cells.name,b.cells.name));
  sections.push({tables:[{
    title:"Comissão técnica",
    columns:[{key:"name",label:"Profissional"},{key:"role",label:"Funções"}],
    rows:commissionRows.length ? commissionRows : [{cells:{name:"Nenhum profissional vinculado"}}],
  }]});
  const eventLabel = [event.name,event.year].filter(Boolean).join(" · ");
  const filters = [
    `Evento: ${eventLabel}`,
    `Situação: ${registrationStatusLabel[status] || "Enviadas, em correção e aprovadas"}`,
    ...(query.trim() ? [`Busca: ${query.trim()}`] : []),
  ];
  return createReportPdf({
    title:"Relatório de inscrições da escola",
    institution:school.name,
    sections,
    filters,
    summary:{records:registrations,people:people.size,schools:1,registrations},
    orientation:"landscape",
  });
}
