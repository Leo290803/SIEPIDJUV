import {downloadAttachment} from "./downloadAttachment.js";
import {
  mapPortalData,
  personPayload,
  issueMessages,
} from "./peopleMapping.js";
export function portalRepository(client) {
  function checked(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  async function readQuery(query, signal, timeoutMs = 15000) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if(signal?.aborted) abort();
    else signal?.addEventListener("abort",abort,{once:true});
    const timer = setTimeout(()=>controller.abort(Error("A consulta demorou demais. Selecione mais filtros e tente novamente.")),timeoutMs);
    try {
      const result = await query.abortSignal(controller.signal);
      if(controller.signal.aborted) throw controller.signal.reason;
      return checked(result);
    } finally { clearTimeout(timer);signal?.removeEventListener("abort",abort); }
  }
  function queryPage(name, parameters, signal) {
    return readQuery(client.rpc(name,parameters),signal);
  }
  async function historyRows(table, tenant, registrationId, signal) {
    const rows=[];
    for(let offset=0;;offset+=500) {
      const page=await readQuery(client.from(table).select("*")
        .eq("institution_id",tenant).eq("registration_id",registrationId)
        .order("id").range(offset,offset+499),signal);
      rows.push(...page);
      if(page.length<500)return rows;
    }
  }
  async function load(tenant, options = {}, signal) {
    const response = await queryPage("siep_portal_page", {
      p_institution_id: tenant, p_mode: options.mode || "light", p_school_id: options.schoolId || null,
      p_role: options.role || null, p_filters: options.filters || {}, p_offset: options.offset || 0,
      p_limit: options.limit || 25, p_detail_id: options.detailId || null, p_edit: !!options.edit,
    },signal);
    return { ...mapPortalData(response.tables), total: response.total, summary: response.summary };
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
          " Reabra o cadastro para revisar os dados e os anexos e tentar novamente.",
      );
    }
  }
  return {
    load,
    reportPage: async (tenant, options, signal) => queryPage("siep_report_page", {
      p_institution_id:tenant,p_filters:options.filters,p_group:options.groupBy || "",p_sort:options.sort || "name",
      p_direction:options.direction || "asc",p_offset:options.offset || 0,p_limit:options.limit || 25,p_snapshot:options.snapshot || null,
    },signal),
    savePerson,
    badgeCandidates: async (event, school, role, query = "", offset = 0, signal) => queryPage("siep_badge_page", { p_event_id:event, p_school_id:school, p_role:role, p_query:query, p_offset:offset, p_limit:25 },signal),
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
    download: attachment => downloadAttachment(client,attachment),
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
    history: async (tenant, id, signal) => {
      if(!tenant || !id)throw Error("Selecione uma inscrição para consultar o histórico.");
      const [versions,decisions]=await Promise.all([
        historyRows("registration_versions",tenant,id,signal),
        historyRows("registration_decisions",tenant,id,signal),
      ]);
      return {versions,decisions};
    },
    notifications: (tenant,signal) => queryPage("siep_notification_center",{p_institution_id:tenant},signal),
    markRead: async (id) =>
      checked(
        await client.rpc("siep_mark_notification_read", {
          p_notification_id: id,
        }),
      ),
  };
}
