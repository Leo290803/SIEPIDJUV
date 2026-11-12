import { ruleCatalog } from "../ruleCatalog.js";
const statuses = {
  draft: "Rascunho",
  open: "Inscrições abertas",
  closed: "Encerrado",
  archived: "Arquivado",
};
export const eventStatusCode = (status) =>
  Object.keys(statuses).find((key) => statuses[key] === status) || "draft";
export function fromEvent(row, config = {}) {
  const modalities = (config.event_modalities || []).map((m) => ({
    id: m.id,
    name: m.name,
    classification:
      m.classification === "collective" ? "Coletiva" : "Individual",
    enabled: m.enabled,
  }));
  const categories = (config.event_categories || []).map((c) => ({
    id: c.id,
    modalityId: c.modality_id,
    modality: modalities.find((m) => m.id === c.modality_id)?.name || "",
    classification: modalities.find((m) => m.id === c.modality_id)
      ?.classification,
    type: c.participation === "team" ? "Equipe" : "Individual",
    name: c.name,
    birthYearStart: c.birth_year_start,
    birthYearEnd: c.birth_year_end,
    gender: c.gender,
    min: c.min_athletes ?? 1,
    max: c.max_athletes ?? 1,
    enabled: c.enabled,
    proofs: (config.event_proofs || [])
      .filter((p) => p.category_id === c.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.kind === "relay" ? "Revezamento" : "Individual",
        enabled: p.enabled,
        slotsPerSchool: p.slots_per_school,
        minAthletes: p.min_athletes,
        gender: p.gender,
      })),
  }));
  return {
    id: row.id,
    institutionId: row.institution_id,
    name: row.name,
    year: row.edition || "",
    type: row.settings?.type || "Outro evento",
    status: statuses[row.status],
    date: row.registration_start
      ? `${row.registration_start.slice(0, 10)} — ${row.registration_end?.slice(0, 10) || "a definir"}`
      : "Datas a definir",
    start: row.registration_start?.slice(0, 10) || "",
    end: row.registration_end?.slice(0, 10) || "",
    version: row.configuration_version,
    schools: 0,
    count: 0,
    modalities,
    categories,
    validationRules: (config.event_rules || []).map((r) => ({
      ...r.parameters,
      id: r.id,
      kind: r.kind,
      categoryId: r.category_id || undefined,
      proofId: r.proof_id || undefined,
      enabled: r.enabled,
    })),
    requirements: {
      data: Object.fromEntries(
        (config.event_fields || []).map((f) => [f.field_key, f.requirement]),
      ),
      documents: (config.document_requirements || [])
        .filter((d) => d.enabled !== false)
        .map((d) => ({
          id: d.id,
          name: d.name,
          required: d.required,
          imageOnly: d.image_only,
          maxBytes: d.max_bytes,
          categoryId: d.category_id,
        })),
    },
    staffFunctions: (config.event_staff_roles || [])
      .filter((r) => r.enabled)
      .map((r) => r.name),
    _fields: config.event_fields || [],
    _staffRoles: config.event_staff_roles || [],
    _settings: row.settings || {},
  };
}
export function sectionPayload(
  event,
  section,
  createId = () => crypto.randomUUID(),
) {
  if (section === "sports")
    return {
      modalities: (event.modalities || []).map((m) => ({
        id: m.id,
        name: m.name,
        classification:
          m.classification === "Coletiva" ? "collective" : "individual",
        enabled: m.enabled !== false,
      })),
      categories: (event.categories || []).map((c) => ({
        id: c.id,
        modality_id: c.modalityId,
        name: c.name,
        participation: c.type === "Equipe" ? "team" : "individual",
        birth_year_start: c.birthYearStart ?? null,
        birth_year_end: c.birthYearEnd ?? null,
        gender: c.gender || null,
        min_athletes: c.min ?? null,
        max_athletes: c.max ?? null,
        enabled: c.enabled !== false,
      })),
      proofs: (event.categories || []).flatMap((c) =>
        (c.proofs || []).map((p) => ({
          id: p.id,
          category_id: c.id,
          name: p.name,
          kind: p.type === "Revezamento" ? "relay" : "individual",
          slots_per_school: p.slotsPerSchool ?? null,
          min_athletes: p.minAthletes ?? null,
          gender: p.gender || null,
          enabled: p.enabled !== false,
        })),
      ),
    };
  if (section === "rules")
    return {
      rules: (event.validationRules || []).map((r) => ({
        id: r.id,
        kind: r.kind,
        category_id: r.categoryId || null,
        proof_id: r.proofId || null,
        enabled: r.enabled !== false,
        parameters: Object.fromEntries([
          ...ruleCatalog
            .find((spec) => spec.kind === r.kind)
            .fields.map(([key]) => [key, r[key] ?? null]),
          ...(r.kind === "age" ? [["referenceDate", r.referenceDate]] : []),
        ]),
      })),
    };
  if (section === "requirements")
    return {
      fields: Object.entries(event.requirements.data).map(
        ([field_key, requirement]) => ({
          id:
            event._fields?.find((f) => f.field_key === field_key)?.id ||
            createId(),
          field_key,
          requirement,
          configuration:
            event._fields?.find((f) => f.field_key === field_key)
              ?.configuration || {},
        }),
      ),
      documents: event.requirements.documents.map((d) => ({
        id: d.id,
        name: d.name,
        required: d.required,
        image_only: !!d.imageOnly,
        max_bytes: d.maxBytes || 5242880,
        category_id: d.categoryId || null,
        enabled: true,
      })),
    };
  if (section === "functions")
    return {
      roles: (event.staffFunctions || []).map((name) => ({
        id: event._staffRoles?.find((r) => r.name === name)?.id || createId(),
        name,
        enabled: true,
      })),
    };
  throw Error("Seção de evento desconhecida.");
}
