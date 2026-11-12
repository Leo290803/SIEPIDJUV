import test from "node:test";
import assert from "node:assert/strict";
import {
  mapPortalData,
  personPayload,
  issueMessages,
} from "../src/data/peopleMapping.js";
import { athleteEventPending } from "../src/eventRequirements.js";
import { portalRepository } from "../src/data/portalRepository.js";
const base = () => ({
  people: [
    {
      id: "person",
      full_name: "Pessoa",
      birth_date: "2012-01-01",
      cpf: "52998224725",
      gender: "Feminino",
      contact: { email: "", custom: "preservar" },
      archived: false,
    },
  ],
  school_people: [
    {
      id: "athlete",
      person_id: "person",
      school_id: "school",
      role: "athlete",
      status: "approved",
      archived: true,
      version: 2,
    },
    {
      id: "staff",
      person_id: "person",
      school_id: "school",
      role: "staff",
      status: "approved",
      position: "Técnico",
      archived: false,
      version: 1,
    },
  ],
  event_participations: [
    {
      id: "part",
      person_id: "person",
      school_id: "school",
      event_id: "event",
      status: "complete",
      additional_data: { email: "evento@example.invalid" },
    },
  ],
  participation_categories: [{ participation_id: "part", category_id: "cat" }],
  participant_documents: [
    {
      id: "doc",
      participation_id: "part",
      event_id: "event",
      requirement_id: "requirement",
      status: "uploaded",
      bucket_id: "siep-documents",
      object_path: "private/path",
      original_name: "a.png",
      mime_type: "image/png",
      size_bytes: 10,
    },
  ],
  membership_decisions: [],
  registrations: [],
  registration_athletes: [],
  registration_staff: [],
  school_event_contexts: [],
  notifications: [],
});
test("uma pessoa exerce papéis independentes sem duplicar identidade ou arquivamento", () => {
  const data = mapPortalData(base());
  assert.equal(data.athletes[0].personId, data.staff[0].personId);
  assert.notEqual(data.athletes[0].id, data.staff[0].id);
  assert.equal(data.athletes[0].archived, true);
  assert.equal(data.staff[0].archived, false);
  assert.equal(personPayload(data.staff[0]).contact.custom, "preservar");
});
test("participação e documento pertencem ao evento e à escola corretos", () => {
  const rows = base();
  rows.school_people.push({
    id: "other",
    person_id: "person",
    school_id: "other-school",
    role: "athlete",
    status: "approved",
  });
  const data = mapPortalData(rows);
  assert.equal(data.athletes[1].eventProfiles.event, undefined);
  assert.equal(
    data.athletes[0].eventProfiles.event.documents.requirement.objectPath,
    "private/path",
  );
});
test("campo adicional da edição satisfaz a exigência sem alterar o contato reutilizável", () => {
  const athlete = mapPortalData(base()).athletes[0];
  const event = {
    id: "event",
    categories: [{ id: "cat", enabled: true }],
    requirements: { data: { email: "required" }, documents: [] },
  };
  assert.deepEqual(athleteEventPending(athlete, event), []);
  assert.equal(athlete.email, "");
});
test("mensagens de pendência não expõem UUIDs internos ao usuário", () => {
  const messages = issueMessages(
    ["participation_incomplete:secret-id", "rule:rule-id:person-id"],
    { validationRules: [{ id: "rule-id", kind: "modalities" }] },
  );
  assert.equal(
    messages.some((m) => m.includes("secret-id") || m.includes("person-id")),
    false,
  );
  assert.match(messages.join(" "), /modalidades/);
});
test("falha de upload preserva rascunho e não tenta marcar cadastro completo", async () => {
  const calls = [];
  const client = {
    rpc: async (name) => {
      calls.push(name);
      if (name === "siep_save_connected_person")
        return { data: { person_id: "person", participation: { id: "part" } } };
      if (name === "siep_prepare_document")
        return {
          data: { id: "doc", bucket: "siep-documents", path: "private" },
        };
      return { data: null };
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: { message: "upload falhou" } }),
      }),
    },
  };
  const record = {
    id: "new",
    schoolId: "school",
    name: "Pessoa",
    birth: "2012-01-01",
    cpf: "52998224725",
    gender: "Feminino",
    eventProfiles: { event: { categoryIds: ["cat"], documents: {} } },
  };
  await assert.rejects(
    portalRepository(client).savePerson("tenant", "athlete", record, {
      event: { id: "event" },
      complete: true,
      files: { requirement: { name: "a.png", type: "image/png", size: 10 } },
    }),
    /preservado como rascunho/,
  );
  assert.deepEqual(calls, [
    "siep_save_connected_person",
    "siep_prepare_document",
  ]);
});
