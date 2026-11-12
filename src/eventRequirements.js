import { personDataIssues } from "./personData.js";
import { categoryAcceptsBirth } from "./categoryEligibility.js";
export const baseDataFields = [
  ["cpf", "CPF"],
  ["birth", "Data de nascimento"],
  ["gender", "Sexo"],
  ["email", "E-mail"],
  ["phone", "Telefone"],
  ["address", "Endereço"],
];
export function requirementsFor(event) {
  const fields = event.fields || [];
  const defaults = {
    data: { email: "hidden", phone: "hidden", address: "hidden" },
    documents: [
      "Foto",
      "Comprovante de matrícula",
      "Autorização do responsável",
    ]
      .filter((name) => fields.includes(name))
      .map((name) => ({
        id: name,
        name,
        required: true,
        imageOnly: name === "Foto",
      })),
  };
  const configured = event.requirements || defaults;
  return {
    ...configured,
    data: {
      ...defaults.data,
      ...configured.data,
      cpf: "required",
      birth: "required",
      gender: "required",
    },
    documents: configured.documents || [],
  };
}
export function athleteEventPending(athlete, event) {
  const profile = athlete.eventProfiles?.[String(event.id)];
  if (!profile) return ["Cadastro no evento"];
  const requirement = requirementsFor(event),
    pending = [];
  pending.push(...personDataIssues(athlete));
  for (const [key, label] of baseDataFields)
    if (
      !["cpf", "birth", "gender"].includes(key) &&
      requirement.data[key] === "required" &&
      !(profile.additionalData?.[key] ?? athlete[key])
    )
      pending.push(label);
  if (
    !(profile.categoryIds || []).some((id) =>
      (event.categories || []).some((c) => c.id === id && c.enabled !== false),
    )
  )
    pending.push("Modalidade e categoria");
  for (const id of profile.categoryIds || []) {
    const category = (event.categories || []).find((c) => c.id === id);
    if (category && !categoryAcceptsBirth(category, athlete.birth))
      pending.push(
        `Ano de nascimento incompatível com ${category.modality} / ${category.name}`,
      );
  }
  for (const doc of requirement.documents)
    if (
      doc.required &&
      (!doc.categoryId ||
        (profile.categoryIds || []).includes(doc.categoryId)) &&
      !profile.documents?.[doc.id]
    )
      pending.push(doc.name);
  return pending;
}
