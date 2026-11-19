import { registrationStatusLabel } from "../data/peopleMapping.js";
import { MAX_EXPORT_ROWS } from "./exportPages.js";
import { createReportPdf } from "./exportPdf.js";

const registrationColumns = [
  { key: "category", label: "Categoria" },
  { key: "proof", label: "Prova" },
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

export async function createSchoolRegistrationsPdf({api, tenant, school, event, status, query, modalityId, signal}) {
  const categories = new Map(event.categories.map(category => [category.id, category]));
  const roles = new Map((event._staffRoles || []).map(role => [role.id, role.name]));
  const seen = new Set();
  const modalities = new Map();
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

    const athletes = new Map(page.athletes.map(person => [person.personId, person.name]));
    const staff = new Map(page.staff.map(person => [person.personId, person.name]));
    const allocated = assignmentsByRegistration(page.allocations);
    const assigned = assignmentsByRegistration(page.registrationStaff);
    for (const registration of page.registrations) {
      if (registration.school_id !== school.id || registration.event_id !== event.id || seen.has(registration.id)) {
        throw Error("A consulta retornou inscrições fora do escopo do relatório ou repetidas. Tente novamente.");
      }
      seen.add(registration.id);
      const category = categories.get(registration.category_id);
      if (modalityId && category?.modalityId !== modalityId) continue;
      registrations++;
      const modalityKey = category?.modalityId;
      if (!modalities.has(modalityKey)) {
        modalities.set(modalityKey, {title:category?.modality || "Modalidade indisponível",athletes:[],staff:[]});
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
      const athleteNames = roster.map(({person_id}) => {
        people.add(person_id);
        return athletes.get(person_id) || "Nome indisponível";
      });
      group.athletes.push({cells:{...cells,names:athleteNames.join("\n") || "—"}});
      for (const assignment of assigned.get(registration.id) || []) {
        people.add(assignment.person_id);
        group.staff.push({cells:{
          ...cells,name:staff.get(assignment.person_id) || "Nome indisponível",
          role:roles.get(assignment.staff_role_id) || "—",
        }});
      }
    }
  } while (seen.size < total);

  if (!registrations) return null;
  const compare = (a,b) => a.localeCompare(b,"pt-BR");
  const byCategory = (a,b) => compare(a.cells.category,b.cells.category) || compare(a.cells.proof,b.cells.proof);
  const sections = [...modalities.values()].sort((a,b) => compare(a.title,b.title)).map(group => ({
    title: group.title,
    tables: [
      {
        title:"Atletas inscritos",
        columns:[...registrationColumns.slice(0,2),{key:"names",label:"Atletas"},...registrationColumns.slice(2)],
        rows:group.athletes.sort(byCategory),
      },
      {
        title:"Comissão técnica",
        columns:[{key:"name",label:"Profissional"},{key:"role",label:"Função"},...registrationColumns],
        rows:group.staff.length
          ? group.staff.sort((a,b) => byCategory(a,b) || compare(a.cells.name,b.cells.name))
          : [{cells:{name:"Nenhum profissional vinculado"}}],
      },
    ],
  }));
  const eventLabel = [event.name,event.year].filter(Boolean).join(" · ");
  const filters = [
    `Evento: ${eventLabel}`,
    `Situação: ${registrationStatusLabel[status] || "Todas as situações"}`,
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
