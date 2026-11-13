import {
  mapPortalData,
  personPayload,
  issueMessages,
} from "./peopleMapping.js";
export function portalRepository(client) {
  const tables = [
    "people",
    "person_photos",
    "school_people",
    "event_participations",
    "participation_categories",
    "participant_documents",
    "membership_decisions",
    "registrations",
    "registration_athletes",
    "registration_staff",
    "school_event_contexts",
    "notifications",
  ];
  function checked(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  async function all(table, tenant, filters = {}) {
    let rows = [],
      start = 0;
    for (;;) {
      let query = client.from(table).select("*").eq("institution_id", tenant);
      for (const [key, value] of Object.entries(filters))
        query = query.eq(key, value);
      const page = checked(await query.order("id").range(start, start + 499));
      rows.push(...page);
      if (page.length < 500) return rows;
      start += 500;
    }
  }
  async function load(tenant) {
    const data = await Promise.all(tables.map((t) => all(t, tenant, t === "person_photos" ? { is_current: true } : {})));
    return mapPortalData(
      Object.fromEntries(tables.map((t, i) => [t, data[i]])),
    );
  }
  async function savePerson(tenant, role, record, options = {}) {
    const profile = options.event
      ? record.eventProfiles[options.event.id]
      : null;
    const additional = { ...(profile?.additionalData || {}) };
    for (const key of ["email", "phone", "address"])
      if (
        options.event?.requirements?.data?.[key] &&
        options.event.requirements.data[key] !== "hidden"
      )
        additional[key] = record[key] || "";
    const personData = personPayload(record);
    if (options.event) personData.contact = record._contact || {};
    const result = checked(
      await client.rpc("siep_save_connected_person", {
        p_institution_id: tenant,
        p_school_id: record.schoolId,
        p_role: role,
        p_data: personData,
        p_link_id: record.personId ? record.id : null,
        p_create_id: record.personId ? null : record.id,
        p_expected_version: record.version ?? null,
        p_expected_person_updated_at: record.personUpdatedAt || null,
        p_event_id: options.event?.id || null,
        p_category_ids: profile?.categoryIds || null,
        p_additional_data: additional,
      }),
    );
    if (options.photo !== undefined) {
      try {
        if (options.photo === null) {
          checked(await client.rpc("siep_remove_person_photo", { p_person_id: result.person_id, p_expected_photo_id: record.photo?.id || null }));
        } else {
          const file = options.photo;
          const metadata = checked(await client.rpc("siep_prepare_person_photo", { p_person_id: result.person_id, p_name: file.name, p_mime_type: file.type, p_size_bytes: file.size, p_expected_photo_id: record.photo?.id || null }));
          checked(await client.storage.from(metadata.bucket).upload(metadata.path, file, { contentType: file.type, upsert: false }));
          checked(await client.rpc("siep_finalize_person_photo", { p_photo_id: metadata.id }));
        }
      } catch (error) {
        throw Error("Os dados do cadastro foram salvos, mas a foto não foi atualizada. A foto anterior foi preservada. Reabra o cadastro e tente novamente. " + error.message);
      }
    }
    if (!options.event) return result;
    const participation = result.participation.id;
    try {
      for (const requirementId of options.removed || []) {
        const document =
          record.eventProfiles[options.event.id].documents?.[requirementId];
        if (document)
          checked(
            await client.rpc("siep_remove_document", {
              p_document_id: document.id,
            }),
          );
      }
      for (const [requirementId, file] of Object.entries(options.files || {})) {
        if (!file) continue;
        const metadata = checked(
          await client.rpc("siep_prepare_document", {
            p_participation_id: participation,
            p_requirement_id: requirementId,
            p_name: file.name,
            p_mime_type: file.type,
            p_size_bytes: file.size,
          }),
        );
        checked(
          await client.storage
            .from(metadata.bucket)
            .upload(metadata.path, file, {
              contentType: file.type,
              upsert: false,
            }),
        );
        checked(
          await client.rpc("siep_finalize_document", {
            p_document_id: metadata.id,
          }),
        );
      }
      if (options.complete) {
        const response = await client.rpc("siep_save_participation", {
          p_event_id: options.event.id,
          p_school_id: record.schoolId,
          p_person_id: result.person_id,
          p_category_ids: profile.categoryIds,
          p_additional_data: additional,
          p_complete: true,
        });
        if (response.error) {
          let issues = [];
          try {
            issues = JSON.parse(response.error.details || "[]");
          } catch {}
          throw Error(
            issueMessages(issues, options.event).join(" ") ||
              response.error.message,
          );
        }
      }
      return result;
    } catch (error) {
      throw Error(
        "O cadastro foi preservado como rascunho. Não foi possível concluir: " +
          error.message +
          " Reabra o cadastro para revisar os anexos e tentar novamente.",
      );
    }
  }
  return {
    load,
    savePerson,
    badgeCandidates: async (event, school, role) => checked(await client.rpc("siep_badge_candidates", { p_event_id:event, p_school_id:school, p_role:role })),
    issueBadges: async (event, entries) => checked(await client.rpc("siep_issue_event_badges", { p_event_id:event, p_entries:entries })),
    badgeHistory: async (tenant, event, school) => {
      let query=client.from("event_badges").select("*").eq("institution_id",tenant).eq("event_id",event);
      if(school)query=query.eq("school_id",school);
      return checked(await query.order("issued_at",{ascending:false}).limit(100));
    },
    decideLink: async (id, status, reason) =>
      checked(
        await client.rpc("siep_decide_school_link", {
          p_link_id: id,
          p_status: {
            Pendente: "pending",
            Aprovado: "approved",
            Recusado: "refused",
            Encerrado: "closed",
          }[status],
          p_reason: reason || "Vínculo aprovado após análise",
        }),
      ),
    download: async (attachment) =>
      checked(
        await client.storage
          .from(attachment.bucket || "siep-documents")
          .download(attachment.objectPath),
      ),
    setActiveEvent: async (school, event) =>
      checked(
        await client.rpc("siep_set_active_event", {
          p_school_id: school,
          p_event_id: event,
        }),
      ),
    eligible: async (event, school, category, proof, registration) =>
      checked(
        await client.rpc("siep_eligible_athletes", {
          p_event_id: event,
          p_school_id: school,
          p_category_id: category,
          p_proof_id: proof || null,
          p_registration_id: registration || null,
        }),
      ),
    saveRegistration: async (input) =>
      checked(await client.rpc("siep_save_registration", input)),
    preview: async (input) =>
      checked(await client.rpc("siep_preview_registration", input)),
    transition: async (r, status, reason, deadline) =>
      checked(
        await client.rpc("siep_transition_registration", {
          p_registration_id: r.id,
          p_expected_revision: r.revision,
          p_status: status,
          p_reason: reason,
          p_correction_deadline: deadline || null,
        }),
      ),
    history: async (tenant, id) => ({
      versions: await all("registration_versions", tenant, {
        registration_id: id,
      }),
      decisions: await all("registration_decisions", tenant, {
        registration_id: id,
      }),
    }),
    markRead: async (id) =>
      checked(
        await client.rpc("siep_mark_notification_read", {
          p_notification_id: id,
        }),
      ),
  };
}
