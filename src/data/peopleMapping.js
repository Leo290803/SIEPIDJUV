import {guardianFields} from "../guardianRequirements.js";
export const linkStatusLabel = {
  pending: "Pendente",
  approved: "Aprovado",
  refused: "Recusado",
  closed: "Encerrado",
};
export const registrationStatusLabel = {
  draft: "Rascunho",
  submitted: "Enviada",
  correction_requested: "Correção solicitada",
  approved: "Aprovada",
  rejected: "Indeferida",
  cancelled: "Cancelada",
};
export function mapPortalData(tables) {
  const people = new Map(tables.people.map((p) => [p.id, p]));
  const index = (rows, key) => {
    const result = new Map();
    for (const row of rows) { const id = key(row); if (!result.has(id)) result.set(id, []); result.get(id).push(row); }
    return result;
  };
  const participations = index(tables.event_participations, p => `${p.person_id}:${p.school_id}`);
  const documentsByParticipation = index(tables.participant_documents.filter(d => d.status === "uploaded"), d => d.participation_id);
  const categories = index(tables.participation_categories, c => c.participation_id);
  const decisions = index(tables.membership_decisions, d => d.school_person_id);
  const photos = new Map((tables.person_photos || []).filter(f => f.is_current && f.status === "uploaded").map(f => [f.person_id, f]));
  const mapRole = (role) =>
    tables.school_people
      .filter((l) => l.role === role && people.has(l.person_id))
      .map((link) => {
        const p = people.get(link.person_id);
        const eventProfiles = {};
        for (const part of (participations.get(`${p.id}:${link.school_id}`) || [])) {
          const documents = Object.fromEntries(
            (documentsByParticipation.get(part.id) || [])
              .map((d) => [
                d.requirement_id,
                {
                  id: d.id,
                  name: d.original_name,
                  type: d.mime_type,
                  size: d.size_bytes,
                  bucket: d.bucket_id,
                  objectPath: d.object_path,
                },
              ]),
          );
          eventProfiles[part.event_id] = {
            participationId: part.id,
            categoryIds: (categories.get(part.id) || [])
              .map((c) => c.category_id),
            documents,
            status: part.status,
            additionalData: part.additional_data,
            updatedAt: part.updated_at,
          };
        }
        return {
          ...p.contact,
          _contact: p.contact,
          id: link.id,
          personId: p.id,
          photo: (() => { const photo = photos.get(p.id); return photo ? { id: photo.id, bucket: photo.bucket_id, objectPath: photo.object_path, name: photo.original_name } : null; })(),
          version: link.version,
          personUpdatedAt: p.updated_at,
          name: p.full_name,
          birth: p.birth_date,
          cpf: p.cpf,
          gender: p.gender,
          schoolId: link.school_id,
          position: link.position || "",
          registration: link.professional_registration || "",
          archived:
            p.archived ||
            link.archived ||
            (["athlete", "staff"].includes(role) && link.status !== "approved"),
          status: linkStatusLabel[link.status],
          userId: link.user_id,
          eventProfiles,
          history: (decisions.get(link.id) || [])
            .map((d) => ({
              date: d.created_at,
              status: linkStatusLabel[d.status],
              reason: d.reason,
            })),
        };
      });
  return {
    athletes: mapRole("athlete"),
    staff: mapRole("staff"),
    responsibles: mapRole("responsible"),
    registrations: tables.registrations,
    allocations: tables.registration_athletes,
    registrationStaff: tables.registration_staff,
    contexts: tables.school_event_contexts,
    notifications: tables.notifications,
  };
}
export function personPayload(record) {
  const contact = { ...(record._contact || {}) };
  for (const key of ["email", "phone", "address"])
    if (record[key] || Object.hasOwn(contact, key))
      contact[key] = record[key] || "";
  return {
    full_name: record.name,
    birth_date: record.birth,
    cpf: record.cpf,
    gender: record.gender,
    position: record.position || null,
    professional_registration: record.registration || null,
    archived: !!record.archived,
    contact,
  };
}
export function issueMessages(issues, event) {
  const labels = {
    athlete_required: "Selecione ao menos um atleta.",
    category_roster: "Confira o mínimo e o máximo de atletas da categoria.",
    proof_minimum: "Complete o mínimo de atletas da prova.",
    proof_required: "Selecione uma prova.",
    proof_capacity_required:
      "A secretaria precisa configurar a quantidade de vagas desta prova.",
    school_archived: "A escola está arquivada.",
    category_disabled: "A categoria está desativada.",
    proof_disabled: "A prova está desativada.",
    guardian_birth_after_event: "O nascimento deve ser anterior ou igual ao início do evento.",
    guardian_person_unavailable: "Confira os dados do atleta para verificar o responsável legal.",
  };
  return [
    ...new Set(
      (issues || []).map((code) => {
        const [kind, id] = code.split(":");
        if (labels[kind]) return labels[kind];
        if (kind === "rule") {
          const rule = event?.validationRules?.find((r) => r.id === id);
          const names = {
            modalities: "Limite de modalidades por atleta",
            athleteCategories: "Limite de categorias na modalidade",
            proofs: "Limite de provas por atleta",
            proofEntries: "Limite de repetições na prova",
            roster: "Quantidade de atletas",
            schoolEntries: "Quantidade de inscrições da escola",
            age: "Faixa de idade",
            staffLimits: "Quantidade de profissionais",
          };
          return (
            (names[rule?.kind] || "Regra de participação") +
            ": revise a seleção."
          );
        }
        if (kind === "document_required")
          return (
            "Anexe " +
            (event?.requirements?.documents.find((d) => d.id === id)?.name ||
              "o documento exigido") +
            "."
          );
        if(kind === "guardian_invalid")return "Revise "+(guardianFields.find(([key])=>key===id)?.[1]?.toLocaleLowerCase('pt-BR')||"os dados do responsável legal")+".";
        if (kind === "field_required")
          return (
            "Preencha o dado obrigatório: " +
            ({ email: "e-mail", phone: "telefone", address: "endereço" }[id] || guardianFields.find(([key])=>key===id)?.[1]?.toLocaleLowerCase('pt-BR') || id) +
            "."
          );
        if (kind === "participation_incomplete")
          return "Conclua ou revise o cadastro dos atletas neste evento.";
        if (kind === "category_not_selected")
          return "Vincule o atleta à categoria no cadastro do evento.";
        if (kind === "birth_year")
          return "O ano de nascimento não corresponde à categoria.";
        if (kind === "gender" || kind === "category_gender")
          return "O sexo do atleta não corresponde à categoria/prova.";
        if (kind === "staff_ineligible")
          return "Revise o vínculo, a função e a disponibilidade da comissão técnica.";
        if (kind === "athlete_school_link_required")
          return "O atleta precisa de vínculo ativo com esta escola.";
        return "Revise a disponibilidade do cadastro e das categorias.";
      }),
    ),
  ];
}
