import test from "node:test";
import assert from "node:assert/strict";
import { fromEvent, sectionPayload } from "../src/data/eventMapping.js";
const row = {
  id: "event",
  institution_id: "tenant",
  name: "Evento",
  edition: "2027",
  status: "draft",
  configuration_version: 7,
  settings: { type: "Evento esportivo", custom: "preservado" },
};
const config = {
  event_modalities: [
    {
      id: "sport",
      name: "Atletismo",
      classification: "individual",
      enabled: true,
    },
  ],
  event_categories: [
    {
      id: "category",
      modality_id: "sport",
      name: "Faixa",
      participation: "individual",
      birth_year_start: 2011,
      birth_year_end: 2014,
      min_athletes: 1,
      max_athletes: 1,
      enabled: true,
    },
  ],
  event_proofs: [
    {
      id: "proof",
      category_id: "category",
      name: "Revezamento",
      kind: "relay",
      slots_per_school: 4,
      min_athletes: 4,
      gender: "Feminino",
      enabled: false,
    },
  ],
  event_rules: [
    {
      id: "rule",
      kind: "proofs",
      category_id: "category",
      parameters: { individual: 2, relay: 1 },
      enabled: true,
    },
  ],
  event_fields: [
    {
      id: "field",
      field_key: "email",
      requirement: "required",
      configuration: { label: "Contato" },
    },
  ],
  document_requirements: [
    {
      id: "document",
      name: "Foto",
      required: true,
      image_only: true,
      max_bytes: 1048576,
      enabled: true,
    },
    { id: "old", name: "Antigo", enabled: false },
  ],
  event_staff_roles: [{ id: "role", name: "Técnico", enabled: true }],
};
test("mapeia dados normalizados sem usar exemplos, preservando identificadores e restrições", () => {
  const event = fromEvent(row, config);
  assert.equal(event.version, 7);
  assert.equal(event._settings.custom, "preservado");
  assert.equal(event.categories[0].proofs[0].slotsPerSchool, 4);
  assert.equal(event.categories[0].proofs[0].gender, "Feminino");
  assert.equal(event.categories[0].proofs[0].enabled, false);
  assert.equal(event.requirements.documents.length, 1);
  assert.deepEqual(event.staffFunctions, ["Técnico"]);
});
test("salva apenas a seção pedida e preserva referências e zero/null nos parâmetros", () => {
  const event = fromEvent(row, config);
  const sports = sectionPayload(event, "sports");
  assert.equal(sports.categories[0].modality_id, "sport");
  assert.equal(sports.proofs[0].kind, "relay");
  assert.equal(sports.proofs[0].min_athletes, 4);
  assert.equal(sports.proofs[0].enabled, false);
  event.validationRules[0].individual = 0;
  event.validationRules[0].relay = null;
  assert.deepEqual(sectionPayload(event, "rules").rules[0].parameters, {
    individual: 0,
    relay: null,
  });
});
test("reutiliza IDs de campos e funções ao salvar e respeita tamanho dos documentos", () => {
  const event = fromEvent(row, config);
  const payload = sectionPayload(event, "requirements", () => {
    throw Error("Não deveria criar ID existente");
  });
  assert.equal(payload.fields[0].id, "field");
  assert.equal(payload.documents[0].max_bytes, 1048576);
  assert.equal(sectionPayload(event, "functions").roles[0].id, "role");
});
test("evento vazio permanece vazio sem inventar modalidades, documentos ou funções", () => {
  const event = fromEvent(row);
  assert.deepEqual(event.categories, []);
  assert.deepEqual(event.staffFunctions, []);
  assert.deepEqual(event.requirements.documents, []);
});
