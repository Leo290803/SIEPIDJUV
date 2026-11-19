import { registrationStatusLabel } from "../data/peopleMapping.js";
import { MAX_EXPORT_ROWS } from "./exportPages.js";
import { createReportPdf } from "./exportPdf.js";

const columns = [
  { key: "category", label: "Modalidade / Categoria" },
  { key: "proof", label: "Prova" },
  { key: "athletes", label: "Atletas" },
  { key: "staff", label: "Comissão técnica" },
  { key: "status", label: "Situação" },
  { key: "deadline", label: "Prazo de correção" },
];

function assignmentsByRegistration(assignments) {
  const index = new Map();
  for (const assignment of assignments) {
    const list = index.get(assignment.registration_id) || [];
    list.push(assignment);
    index.set(assignment.registration_id, list);
  }
  return index;
}

export async function createSchoolRegistrationsPdf({api, tenant, school, event, status, query, signal}) {
  const categories = new Map(event.categories.map(category => [category.id, category]));
  const roles = new Map((event._staffRoles || []).map(role => [role.id, role.name]));
  const rows = new Map();
  const people = new Set();
  let total;
  do {
    signal.throwIfAborted();
    const page = await api.load(tenant, {
      mode: "registrations",
      schoolId: school.id,
      filters: {eventId:event.id,status,query},
      offset: rows.size,
      limit: 100,
    }, signal);
    signal.throwIfAborted();
    if ((total !== undefined && total !== page.total) || (!page.registrations.length && rows.size < page.total)) {
      throw Error("As inscrições mudaram durante a geração. Tente baixar o PDF novamente.");
    }
    total = page.total;
    if (total > MAX_EXPORT_ROWS) throw Error("Há muitas inscrições para um PDF. Filtre por situação e tente novamente.");

    const athletes = new Map(page.athletes.map(person => [person.personId, person.name]));
    const staff = new Map(page.staff.map(person => [person.personId, person.name]));
    const allocated = assignmentsByRegistration(page.allocations);
    const assigned = assignmentsByRegistration(page.registrationStaff);
    for (const registration of page.registrations) {
      if (registration.school_id !== school.id || registration.event_id !== event.id || rows.has(registration.id)) {
        throw Error("A consulta retornou inscrições fora do escopo do relatório ou repetidas. Tente novamente.");
      }
      const category = categories.get(registration.category_id);
      const proof = category?.proofs.find(item => item.id === registration.proof_id);
      const roster = (allocated.get(registration.id) || []).sort((a,b) => a.slot_number-b.slot_number);
      const staffRoster = (assigned.get(registration.id) || []).map(assignment => {
        people.add(assignment.person_id);
        return [staff.get(assignment.person_id) || "Nome indisponível", roles.get(assignment.staff_role_id)].filter(Boolean).join(" · ");
      }).sort((a,b) => a.localeCompare(b,"pt-BR"));
      rows.set(registration.id, {cells:{
        category: category ? [category.modality, category.name].filter(Boolean).join(" · ") : "Categoria indisponível",
        proof: proof?.name || "—",
        athletes: roster.map(assignment => {
          people.add(assignment.person_id);
          return athletes.get(assignment.person_id) || "Nome indisponível";
        }).join("\n") || "—",
        staff: staffRoster.join("\n") || "—",
        status: registrationStatusLabel[registration.status] || registration.status,
        deadline: registration.status === "correction_requested" && registration.correction_deadline
          ? new Date(registration.correction_deadline).toLocaleString("pt-BR",{timeZone:"America/Manaus"})
          : "—",
      }});
    }
  } while (rows.size < total);

  if (!rows.size) return null;
  const eventLabel = [event.name,event.year].filter(Boolean).join(" · ");
  const filters = [
    `Evento: ${eventLabel}`,
    `Situação: ${registrationStatusLabel[status] || "Todas as situações"}`,
    ...(query.trim() ? [`Busca: ${query.trim()}`] : []),
  ];
  return createReportPdf({
    title:"Relatório de inscrições da escola",
    institution:school.name,
    columns,
    rows:[...rows.values()],
    filters,
    summary:{records:rows.size,people:people.size,schools:1,registrations:rows.size},
    orientation:"landscape",
  });
}
