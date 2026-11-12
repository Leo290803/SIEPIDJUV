import { fromEvent, sectionPayload, eventStatusCode } from "./eventMapping.js";
function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
export function repositories(client) {
  async function all(table, tenant) {
    let rows = [],
      start = 0;
    for (;;) {
      const page = checked(
        await client
          .from(table)
          .select("*")
          .eq("institution_id", tenant)
          .order("id")
          .range(start, start + 499),
      );
      rows.push(...page);
      if (page.length < 500) return rows;
      start += 500;
    }
  }
  const configTables = [
    "event_modalities",
    "event_categories",
    "event_proofs",
    "event_rules",
    "event_fields",
    "document_requirements",
    "event_staff_roles",
  ];
  async function events(tenant) {
    const [rows, ...config] = await Promise.all([
      all("events", tenant),
      ...configTables.map((t) => all(t, tenant)),
    ]);
    return rows.map((row) =>
      fromEvent(
        row,
        Object.fromEntries(
          configTables.map((t, i) => [
            t,
            config[i].filter((c) => c.event_id === row.id),
          ]),
        ),
      ),
    );
  }
  return {
    institutions: async () =>
      checked(await client.from("institutions").select("*").order("name")),
    memberships: async () =>
      checked(
        await client
          .from("institution_memberships")
          .select("*")
          .eq("status", "approved"),
      ),
    schools: async (tenant) =>
      (await all("schools", tenant)).map((s) => ({
        ...s,
        ...s.details,
        inep: s.inep || "",
        id: s.id,
        name: s.name,
        archived: s.archived,
      })),
    saveSchool: async (tenant, school, exists) => {
      const data = {
        name: school.name,
        inep: school.inep || null,
        archived: school.archived,
        details: {
          ...(school.details || {}),
          city: school.city,
          address: school.address,
          email: school.email,
          phone: school.phone,
        },
      };
      const query = exists
        ? client
            .from("schools")
            .update(data)
            .eq("id", school.id)
            .eq("institution_id", tenant)
            .eq("updated_at", school.updated_at)
        : client
            .from("schools")
            .insert({ ...data, id: school.id, institution_id: tenant });
      return checked(await query.select().single());
    },
    events,
    createEvent: async (tenant, input) =>
      checked(
        await client
          .from("events")
          .insert({
            id: input.id,
            institution_id: tenant,
            name: input.name,
            edition: input.year,
            status: "draft",
            registration_start: input.start
              ? input.start + "T00:00:00-04:00"
              : null,
            registration_end: input.end ? input.end + "T23:59:59-04:00" : null,
            settings: { type: input.type },
          })
          .select()
          .single(),
      ),
    updateEvent: async (event) =>
      checked(
        await client
          .from("events")
          .update({
            name: event.name,
            edition: event.year,
            status: eventStatusCode(event.status),
            registration_start: event.start
              ? event.start + "T00:00:00-04:00"
              : null,
            registration_end: event.end ? event.end + "T23:59:59-04:00" : null,
            settings: { ...event._settings, type: event.type },
          })
          .eq("id", event.id)
          .eq("institution_id", event.institutionId)
          .eq("configuration_version", event.version)
          .select()
          .single(),
      ),
    saveConfiguration: async (event, section) =>
      checked(
        await client.rpc("siep_save_event_configuration", {
          p_event_id: event.id,
          p_expected_version: event.version,
          p_section: section,
          p_payload: sectionPayload(event, section),
        }),
      ),
    duplicate: async (source, input) =>
      checked(
        await client.rpc("siep_duplicate_event", {
          p_source_event_id: source.id,
          p_name: input.name,
          p_edition: input.year,
          p_registration_start: input.start
            ? input.start + "T00:00:00-04:00"
            : null,
          p_registration_end: input.end ? input.end + "T23:59:59-04:00" : null,
        }),
      ),
    saveInstitution: async (institution) =>
      checked(
        await client
          .from("institutions")
          .update({ name: institution.name, branding: institution.branding })
          .eq("id", institution.id)
          .select()
          .single(),
      ),
  };
}
