const origin=process.env.SIEP_TEST_ORIGIN||'http://localhost:5173';
// Navegador real + API simulada: não cria contas nem envia e-mails.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({
    chromium,
  } = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
(async () => {
  const {mapPortalData}=await import('../src/data/peopleMapping.js');
  const {fromEvent}=await import('../src/data/eventMapping.js');
  const {buildReport,groupRows,sortRows,normalize}=await import('../src/reports/model.js');
  const queryCalls=[];
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin-test@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const tenant = "22222222-2222-4222-8222-222222222222";
  let isAdmin = true,
    failSchool = true,
    resetRedirect = "",
    authCalls = 0;
  let isManager = false;
  const registrationTransitions=[];
  const tables = {
    institutions: [
      {
        id: tenant,
        name: "IDJUV teste",
        slug: "idjuv",
        branding: { subtitle: "Teste de integração" },
      },
    ],
    institution_memberships: [
      {
        id: "membership",
        institution_id: tenant,
        user_id: user.id,
        role: "admin",
        status: "approved",
      },
    ],
    schools: [],
    events: [],
    event_modalities: [],
    event_categories: [],
    event_proofs: [],
    event_rules: [],
    event_fields: [],
    document_requirements: [],
    event_staff_roles: [],
    school_link_requests: [],
    school_people: [],
    people: [],
    person_photos: [],
    event_participations: [],
    participation_categories: [],
    participant_documents: [],
    membership_decisions: [],
    registrations: [],
    registration_athletes: [],
    registration_staff: [],
    school_event_contexts: [],
    notifications: [],
    registration_versions: [],
    registration_decisions: [],
    event_badges: [],
  };
  const uploadedPaths = new Set();
  const portrait = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const response = (route, data, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "content-range",
        "content-range": "0-0/*",
      },
      body: JSON.stringify(data),
    });
  await context.route(
    "https://oshzcmmbhxvmchjgxztp.supabase.co/**",
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        body = req.headers()["content-type"]?.includes("application/json")
          ? req.postDataJSON()
          : null,
        method = req.method();
      if (method === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
          },
        });
      if (url.pathname.startsWith("/auth/")) {
        authCalls++;
        if (url.pathname.endsWith("/token")) {
          if(url.searchParams.get('grant_type')==='refresh_token'&&body.refresh_token==='expired-test')return response(route,{error:'invalid_grant',message:'Invalid Refresh Token',msg:'Invalid Refresh Token'},400);
          if (
            url.searchParams.get("grant_type") === "password" &&
            body.password !== "senha-de-teste-longa"
          )
            return response(
              route,
              {
                error: "invalid_grant",
                message: "Invalid login credentials",
                msg: "Invalid login credentials",
              },
              400,
            );
          const token =
            btoa(JSON.stringify({ alg: "HS256" })) +
            "." +
            btoa(
              JSON.stringify({
                sub: user.id,
                exp: Math.floor(Date.now() / 1000) + 3600,
                role: "authenticated",
              }),
            ) +
            ".test";
          return response(route, {
            access_token: token,
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          });
        }
        if (url.pathname.endsWith("/recover")) {
          resetRedirect = url.searchParams.get("redirect_to");
          return response(route, {});
        }
        if (url.pathname.endsWith("/signup"))
          return response(route, {
            id: user.id,
            email: user.email,
            identities: [],
          });
        if (url.pathname.endsWith("/logout"))
          return route.fulfill({ status: 204 });
        if (url.pathname.endsWith("/user")) return response(route, user);
      }
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const match=url.pathname.match(/\/storage\/v1\/object\/(?:authenticated\/)?(siep-documents|siep-person-photos)\/(.*)/);
        const bucket=match?.[1],path=match?.[2];
        if (method === "POST") { uploadedPaths.add(path); return response(route, { Key: bucket+"/"+path, Id: randomUUID() }); }
        return route.fulfill({ status:200, body:bucket==='siep-person-photos'?portrait:Buffer.from("test-image"),contentType:"image/png" });
      }
      const table = url.pathname.split("/").at(-1);
      if(table==='siep_report_page'){
        queryCalls.push({table,body});
        const schools=tables.schools.map(s=>({...s,...s.details}));
        const configKeys=['event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles'];
        const events=tables.events.map(e=>fromEvent(e,Object.fromEntries(configKeys.map(k=>[k,tables[k].filter(r=>r.event_id===e.id)]))));
        const report=buildReport({data:mapPortalData(tables),events,schools},body.p_filters);
        const rows=sortRows(body.p_group?groupRows(report.rows,body.p_group):report.rows,body.p_sort,body.p_direction);
        return response(route,{rows:rows.slice(body.p_offset,body.p_offset+body.p_limit),total:rows.length,summary:report.summary,snapshot:'fixture-stable'});
      }
      if(table==='siep_portal_page'){
        queryCalls.push({table,body});
        const scope=body.p_school_id,filters=body.p_filters||{},mode=body.p_mode;
        const event=filters.eventId||tables.school_event_contexts.find(c=>c.school_id===scope)?.event_id;
        const pmap=new Map(tables.people.map(p=>[p.id,p])),smap=new Map(tables.schools.map(s=>[s.id,s]));
        let links=[],registrations=[],total=0;
        if(mode==='people'){
          links=tables.school_people.filter(l=>l.role===body.p_role&&(!scope||l.school_id===scope)&&(!filters.schoolId||l.school_id===filters.schoolId)).filter(l=>{
            const p=pmap.get(l.person_id),archived=p.archived||l.archived||(['athlete','staff'].includes(l.role)&&l.status!=='approved');
            const state=filters.status||'all';
            return (['all','Todos'].includes(state)||state==='active'&&!archived||state==='archived'&&archived||({Pendente:'pending',Aprovado:'approved',Recusado:'refused',Encerrado:'closed'})[state]===l.status)&&normalize([p.full_name,p.cpf,smap.get(l.school_id)?.name,l.position,p.contact?.email].join(' ')).includes(normalize(filters.query||''));
          }).sort((a,b)=>pmap.get(a.person_id).full_name.localeCompare(pmap.get(b.person_id).full_name));
          total=links.length;links=links.slice(body.p_offset,body.p_offset+body.p_limit);
          if(body.p_detail_id&&!links.some(l=>l.id===body.p_detail_id)){const l=tables.school_people.find(l=>l.id===body.p_detail_id);if(l)links.push(l);}
        }
        if(mode==='registrations'){
          registrations=tables.registrations.filter(r=>(!scope||r.school_id===scope)&&(!event||r.event_id===event)&&(!filters.status||filters.status==='all'||r.status===filters.status)&&normalize([tables.events.find(e=>e.id===r.event_id)?.name,smap.get(r.school_id)?.name].join(' ')).includes(normalize(filters.query||'')));
          total=registrations.length;registrations=registrations.slice(body.p_offset,body.p_offset+body.p_limit);
          if(body.p_detail_id&&!registrations.some(r=>r.id===body.p_detail_id)){const r=tables.registrations.find(r=>r.id===body.p_detail_id);if(r)registrations.push(r);}
        }
        const rids=new Set(registrations.map(r=>r.id));
        const allocations=tables.registration_athletes.filter(a=>rids.has(a.registration_id)||(mode==='registrations'&&body.p_edit&&a.school_id===scope&&a.event_id===event));
        const assigned=tables.registration_staff.filter(a=>rids.has(a.registration_id));
        const pids=new Set([...links.map(l=>l.person_id),...allocations.map(a=>a.person_id),...assigned.map(a=>a.person_id)]);
        if(mode==='registrations'){
          if(body.p_edit)for(const l of tables.school_people.filter(l=>l.role==='staff'&&l.school_id===scope))pids.add(l.person_id);
          links=tables.school_people.filter(l=>pids.has(l.person_id)&&(!scope||l.school_id===scope));
        }
        const parts=tables.event_participations.filter(p=>pids.has(p.person_id)&&(!scope||p.school_id===scope)),partids=new Set(parts.map(p=>p.id));
        const selected={...tables,people:tables.people.filter(p=>pids.has(p.id)),school_people:links,person_photos:tables.person_photos.filter(p=>pids.has(p.person_id)),event_participations:parts,participation_categories:tables.participation_categories.filter(p=>partids.has(p.participation_id)),participant_documents:tables.participant_documents.filter(p=>partids.has(p.participation_id)),membership_decisions:[],registrations,registration_athletes:allocations,registration_staff:assigned,school_event_contexts:tables.school_event_contexts.filter(c=>c.school_id===scope),notifications:mode==='notifications'?tables.notifications:[]};
        return response(route,{tables:selected,total,summary:{pendingLinks:tables.school_people.filter(l=>l.role==='responsible'&&l.status==='pending').length,submitted:tables.registrations.filter(r=>r.status==='submitted').length,unread:tables.notifications.filter(n=>!n.read_at).length}});
      }
      if(table==='siep_read_development_photo'){
        assert.ok(tables.person_photos.some(p=>p.bucket_id==='siep-development-photos'&&p.object_path===body.p_path));
        return response(route,{mime_type:'image/png',base64:portrait.toString('base64')});
      }
      if (table === "siep_prepare_person_photo") {
        const current=tables.person_photos.find(p=>p.person_id===body.p_person_id&&p.is_current);
        assert.equal(body.p_expected_photo_id,current?.id||null);
        const id=randomUUID(),path=tenant+"/"+body.p_person_id+"/"+id+".png";
        tables.person_photos.push({id,institution_id:tenant,person_id:body.p_person_id,bucket_id:"siep-person-photos",object_path:path,original_name:body.p_name,status:"pending",is_current:false});
        return response(route,{id,bucket:"siep-person-photos",path});
      }
      if (table === "siep_finalize_person_photo") {
        const photo=tables.person_photos.find(p=>p.id===body.p_photo_id);assert.ok(uploadedPaths.has(photo.object_path));
        for(const old of tables.person_photos.filter(p=>p.person_id===photo.person_id&&p.is_current)){old.is_current=false;old.status="superseded";}
        photo.is_current=true;photo.status="uploaded";return response(route,null);
      }
      if (table === "siep_remove_person_photo") {
        const photo=tables.person_photos.find(p=>p.person_id===body.p_person_id&&p.is_current);assert.equal(body.p_expected_photo_id,photo?.id||null);if(photo){photo.is_current=false;photo.status="superseded";}return response(route,null);
      }
      if (table === "siep_badge_page") {
        const eligible=new Map();
        for(const registration of tables.registrations.filter(r=>r.event_id===body.p_event_id&&r.status==='approved'&&(!body.p_school_id||r.school_id===body.p_school_id))){
          for(const [role,assignments] of [['athlete',tables.registration_athletes],['staff',tables.registration_staff]])for(const assignment of assignments.filter(a=>a.registration_id===registration.id)){
            if(body.p_role&&body.p_role!==role)continue;
            const person=tables.people.find(p=>p.id===assignment.person_id),school=tables.schools.find(s=>s.id===registration.school_id),photo=tables.person_photos.find(p=>p.person_id===person.id&&p.is_current);
            const row={person_id:person.id,school_id:school.id,role,role_label:role==='athlete'?'Atleta':'Comissão técnica',person_name:person.full_name,school_name:school.name,photo_id:photo?.id||null,photo_bucket:photo?.bucket_id,photo_path:photo?.object_path};
            eligible.set([school.id,person.id,role].join(':'),row);
          }
        }
        const all=[...eligible.values()].filter(r=>normalize(r.person_name+' '+r.school_name).includes(normalize(body.p_query||'')));
        return response(route,{rows:all.slice(body.p_offset,body.p_offset+body.p_limit),total:all.length});
      }
      if (table === "siep_issue_event_badges") {
        const event=tables.events.find(e=>e.id===body.p_event_id),issued=[];
        for(const entry of body.p_entries){
          const person=tables.people.find(p=>p.id===entry.person_id),school=tables.schools.find(s=>s.id===entry.school_id),photo=tables.person_photos.find(p=>p.person_id===person.id&&p.is_current);
          const previous=tables.event_badges.filter(b=>b.event_id===event.id&&b.school_id===school.id&&b.person_id===person.id&&b.role===entry.role);
          for(const badge of previous)badge.is_current=false;
          const badge={id:randomUUID(),institution_id:tenant,event_id:event.id,person_id:person.id,school_id:school.id,role:entry.role,photo_id:photo.id,version:previous.length+1,is_current:true,issued_at:new Date().toISOString(),snapshot:{event_name:event.name,edition:event.edition,institution_name:'IDJUV',person_name:person.full_name,school_name:school.name,role_label:entry.role==='athlete'?'Atleta':'Comissão técnica',photo_bucket:photo.bucket_id,photo_path:photo.object_path}};
          issued.push(badge);tables.event_badges.push(badge);
        }
        return response(route,issued);
      }
      if (table === "siep_save_connected_person") {
        let link = tables.school_people.find((l) => l.id === body.p_link_id);
        let person = link
          ? tables.people.find((p) => p.id === link.person_id)
          : tables.people.find((p) => p.cpf === body.p_data.cpf);
        if (!person) {
          person = {
            id: body.p_create_id || randomUUID(),
            institution_id: tenant,
            full_name: body.p_data.full_name,
            birth_date: body.p_data.birth_date,
            cpf: body.p_data.cpf,
            gender: body.p_data.gender,
            contact: body.p_data.contact,
            archived: false,
            updated_at: new Date().toISOString(),
          };
          tables.people.push(person);
        }
        if (!link) {
          link = {
            id: randomUUID(),
            institution_id: tenant,
            school_id: body.p_school_id,
            person_id: person.id,
            role: body.p_role,
            status: body.p_role === "responsible" ? "pending" : "approved",
            version: 1,
          };
          tables.school_people.push(link);
        }
        Object.assign(link, {
          archived: body.p_data.archived,
          position: body.p_data.position,
          professional_registration: body.p_data.professional_registration,
        });
        link.version++;
        let part = null;
        if (body.p_event_id) {
          part = tables.event_participations.find(
            (p) => p.person_id === person.id && p.event_id === body.p_event_id,
          );
          if (!part) {
            part = {
              id: randomUUID(),
              institution_id: tenant,
              school_id: body.p_school_id,
              person_id: person.id,
              event_id: body.p_event_id,
            };
            tables.event_participations.push(part);
          }
          Object.assign(part, {
            status: "draft",
            additional_data: body.p_additional_data,
          });
          tables.participation_categories =
            tables.participation_categories.filter(
              (c) => c.participation_id !== part.id,
            );
          for (const id of body.p_category_ids || [])
            tables.participation_categories.push({
              id: randomUUID(),
              institution_id: tenant,
              event_id: body.p_event_id,
              participation_id: part.id,
              category_id: id,
            });
        }
        return response(route, {
          person_id: person.id,
          link_id: link.id,
          version: link.version,
          participation: part,
        });
      }
      if (table === "siep_set_active_event") {
        tables.school_event_contexts = [
          {
            id: randomUUID(),
            institution_id: tenant,
            school_id: body.p_school_id,
            event_id: body.p_event_id,
          },
        ];
        return response(route, null);
      }
      if (table === "siep_save_participation") {
        const part = tables.event_participations.find(
          (p) =>
            p.person_id === body.p_person_id && p.event_id === body.p_event_id,
        );
        part.status = body.p_complete ? "complete" : "draft";
        part.additional_data=body.p_additional_data;
        return response(route, {
          id: part.id,
          status: part.status,
          issues: [],
        });
      }
      if (table === "siep_prepare_document") {
        const part = tables.event_participations.find(
          (p) => p.id === body.p_participation_id,
        );
        const id = randomUUID(),
          path =
            tenant + "/" + part.event_id + "/" + part.id + "/" + id + ".png";
        const d = {
          id,
          institution_id: tenant,
          event_id: part.event_id,
          participation_id: part.id,
          requirement_id: body.p_requirement_id,
          bucket_id: "siep-documents",
          object_path: path,
          mime_type: body.p_mime_type,
          size_bytes: body.p_size_bytes,
          original_name: body.p_name,
          status: "pending",
        };
        tables.participant_documents.push(d);
        return response(route, { id, bucket: "siep-documents", path });
      }
      if (table === "siep_finalize_document") {
        const d = tables.participant_documents.find(
          (d) => d.id === body.p_document_id,
        );
        assert.ok(uploadedPaths.has(d.object_path));
        d.status = "uploaded";
        return response(route, null);
      }
      if (table === "siep_eligible_athletes")
        return response(
          route,
          tables.event_participations
            .filter((p) => p.status === "complete")
            .map((p) => ({
              participation_id: p.id,
              person_id: p.person_id,
              full_name: tables.people.find(
                (person) => person.id === p.person_id,
              ).full_name,
            })),
        );
      if (table === "siep_preview_registration")
        return response(route, { issues: [] });
      if (table === "siep_save_registration") {
        let r = tables.registrations.find(
          (r) => r.id === body.p_registration_id,
        );
        if (!r) {
          r = {
            id: randomUUID(),
            institution_id: tenant,
            event_id: body.p_event_id,
            school_id: body.p_school_id,
            category_id: body.p_category_id,
            proof_id: body.p_proof_id,
            status: "draft",
            revision: 1,
          };
          tables.registrations.push(r);
        } else r.revision++;
        tables.registration_athletes = body.p_athletes.map((a) => ({
          id: randomUUID(),
          institution_id: tenant,
          event_id: r.event_id,
          school_id: r.school_id,
          registration_id: r.id,
          participation_id: a.participation_id,
          person_id: tables.event_participations.find(
            (p) => p.id === a.participation_id,
          ).person_id,
          proof_id: r.proof_id,
          slot_number: a.slot_number,
          active: true,
        }));
        tables.registration_staff = body.p_staff.map((s) => ({
          ...s,
          id: randomUUID(),
          institution_id: tenant,
          event_id: r.event_id,
          school_id: r.school_id,
          registration_id: r.id,
        }));
        return response(route, {
          id: r.id,
          status: r.status,
          revision: r.revision,
          issues: [],
        });
      }
      if (table === "siep_transition_registration") {
        const r = tables.registrations.find(
          (r) => r.id === body.p_registration_id,
        );
        if(!isAdmin&&!isManager&&['approved','rejected','correction_requested'].includes(body.p_status))return response(route,{code:'42501',message:'Somente a Secretaria pode analisar'},403);
        registrationTransitions.push({from:r.status,to:body.p_status,actor:isAdmin||isManager?'secretaria':'escola'});
        r.status = body.p_status;
        r.correction_deadline=body.p_correction_deadline||r.correction_deadline;
        r.revision++;
        return response(route, r);
      }

      if (table === "siep_password_change_required") return response(route, false);
      if (table === "siep_my_access")
        return response(route, [
          {
            ...tables.institutions[0],
            staff_role: isAdmin ? "admin" : isManager ? "manager" : null,
            schools:
              isAdmin || isManager
                ? []
                : tables.schools.map((s) => ({ id: s.id, name: s.name })),
          },
        ]);
      if (table === "siep_staff_accounts")
        return isAdmin
          ? response(
              route,
              tables.institution_memberships.map((m) => ({
                ...m,
                email: user.email,
              })),
            )
          : response(route, { code: "42501", message: "denied" }, 403);
      if (table === "siep_save_event_configuration") {
        const ev = tables.events.find((e) => e.id === body.p_event_id);
        if (body.p_expected_version !== ev.configuration_version)
          return response(route, { code: "40001", message: "stale" }, 409);
        const names = {
          modalities: "event_modalities",
          categories: "event_categories",
          proofs: "event_proofs",
          rules: "event_rules",
          fields: "event_fields",
          documents: "document_requirements",
          roles: "event_staff_roles",
        };
        for (const [key, rows] of Object.entries(body.p_payload)) {
          if(key==='guardian'){ev.settings={...ev.settings,guardian:rows};continue;}
          tables[names[key]] = rows.map((r) => ({...r,event_id: ev.id,institution_id: tenant}));
        }
        ev.configuration_version++;
        return response(route, ev.configuration_version);
      }
      if (!(table in tables))
        return response(
          route,
          { code: "unexpected", message: "Unexpected request " + url.pathname },
          400,
        );
      if (method === "GET")
        return response(
          route,
          table === "institution_memberships" && !isAdmin ? [] : tables[table],
        );
      if (table === "schools" && method === "POST" && failSchool) {
        failSchool = false;
        return response(route, { code: "23505", message: "duplicate" }, 409);
      }
      if (method === "POST") {
        const row = {
          ...body,
          configuration_version: 1,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        tables[table].push(row);
        return response(route, row, 201);
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const row = tables[table].find((r) => r.id === id);
        Object.assign(row, body);
        if (table === "events") row.configuration_version++;
        return response(route, row);
      }
      return response(route, { message: "Unexpected method" }, 400);
    },
  );
  await page.addInitScript(() => {
    if (!localStorage.getItem("siep-events"))
      localStorage.setItem(
        "siep-events",
        JSON.stringify([
          {
            id: 42,
            name: "Evento local preservado",
            year: "2026",
            type: "Outro evento",
            status: "Rascunho",
            schools: 0,
            count: 0,
          },
        ]),
      );
  });
  await page.goto(origin);
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  assert.equal(authCalls, 0);
  assert.equal(await page.getByRole("button", { name: "Abrir demonstração local" }).count(), 0);
  await page.goto(origin + "/demonstracao");
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/entrar");
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await page
    .getByText(
      "Se houver uma conta para este endereço, você receberá as instruções de recuperação.",
    )
    .waitFor();
  assert.equal(resetRedirect, origin + "/?recovery=1");
  await page.getByRole("button", { name: "Voltar ao acesso" }).click();
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste-longa");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo evento", exact: true })
    .waitFor();
  assert.equal(
    await page.getByText("Evento local preservado", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Escolas", exact: true }).click();
  await page
    .getByRole("button", { name: "Cadastrar escola", exact: true })
    .click();
  await page
    .getByLabel("Nome da escola *", { exact: true })
    .fill("Escola conectada");
  await page.getByLabel("Município *", { exact: true }).fill("Boa Vista");
  await page
    .getByRole("button", { name: "Salvar escola", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Já existe um registro" })
    .waitFor();
  assert.equal(tables.schools.length, 0);
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page
    .getByRole("button", { name: "Salvar escola", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Escola conectada", exact: true })
    .waitFor();
  assert.equal(tables.schools.length, 1);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("siep-schools")),
    null,
  );
  await page.getByRole("button", { name: "Eventos", exact: true }).click();
  await page.getByRole("button", { name: "Novo evento", exact: true }).click();
  await page
    .getByLabel("Nome do evento", { exact: true })
    .fill("Evento conectado");
  await page
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await page.getByText("Evento conectado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Gerenciar", exact: true }).click();
  await page.getByRole("tab", { name: "Modalidades e categorias" }).click();
  await page
    .getByRole("button", { name: "Nova modalidade", exact: true })
    .click();
  await page.getByLabel("Nome da modalidade *").fill("Futsal");
  await page.getByRole("button", { name: "Salvar modalidade" }).click();
  await page.getByRole("heading", { name: "Futsal", exact: true }).waitFor();
  assert.equal(tables.event_modalities.length, 1);
  await page
    .getByRole("button", { name: "Nova categoria", exact: true })
    .click();
  await page
    .getByLabel("Nome da categoria", { exact: true })
    .fill("12 a 14 anos");
  await page
    .getByRole("button", { name: "Salvar categoria", exact: true })
    .click();
  await page.getByText("12 a 14 anos", { exact: true }).waitFor();
  assert.equal(tables.event_categories.length, 1);
  await page
    .getByRole("tab", { name: "Formulário e documentos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar documento", exact: true })
    .click();
  await page.getByLabel("Documento 1", { exact: true }).fill("Foto");
  await page.getByRole('checkbox',{name:'Solicitar dados do responsável somente para menores de 18 anos',exact:true}).check();
  await page.getByLabel('Data de início do evento para calcular a idade',{exact:true}).fill('2026-12-01');
  await page.getByLabel('Exigência de E-mail do responsável',{exact:true}).selectOption('optional');
  await page
    .getByRole("button", {
      name: "Salvar formulário e documentos",
      exact: true,
    })
    .click();
  await page
    .getByText("Configuração salva no banco.", { exact: true })
    .waitFor();
  await page.screenshot({path:'/tmp/siep-guardian-settings-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/siep-guardian-settings-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page
    .getByRole("button", { name: "Editar informações do evento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('select[name="status"]')
    .selectOption("Inscrições abertas");
  await page
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  for (const name of [
    "Visão geral",
    "Atletas",
    "Comissão técnica",
    "Inscrições e documentos",
    "Notificações",
  ])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      1,
      "Menu ausente: " + name,
    );
  await page.getByRole("button", { name: "Atletas", exact: true }).click();
  await page
    .getByRole("button", { name: "Cadastrar atleta", exact: true })
    .click();
  await page
    .getByLabel("Nome completo *", { exact: true })
    .fill("Atleta conectado");
  await page.getByLabel("CPF *", { exact: true }).fill("52998224725");
  await page
    .getByLabel("Data de nascimento *", { exact: true })
    .fill("2012-01-01");
  await page.locator('select[name="gender"]').selectOption("Feminino");
  await page
    .getByRole("dialog")
    .locator('select[name="schoolId"]')
    .selectOption(tables.schools[0].id);
  await page.getByLabel("Foto de identificação",{exact:true}).setInputFiles({name:"invalido.pdf",mimeType:"application/pdf",buffer:Buffer.from("pdf")});
  await page.getByText("Selecione uma foto PNG ou JPEG de até 5 MB.",{exact:true}).waitFor();
  await page.getByLabel("Foto de identificação",{exact:true}).setInputFiles({name:"identificacao.png",mimeType:"image/png",buffer:portrait});
  await page.getByRole("img",{name:"Prévia da foto de identificação"}).waitFor();
  await page
    .getByRole("button", { name: "Salvar atleta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Atleta conectado", exact: true })
    .waitFor();
  assert.equal(tables.people.length, 1);
  assert.equal(tables.person_photos.filter(p=>p.is_current).length,1);
  await page
    .getByRole("button", { name: "Comissão técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cadastrar profissional", exact: true })
    .click();
  await page
    .getByLabel("Nome completo *", { exact: true })
    .fill("Atleta conectado");
  await page.getByLabel("CPF *", { exact: true }).fill("52998224725");
  await page
    .getByLabel("Data de nascimento *", { exact: true })
    .fill("2012-01-01");
  await page.locator('select[name="gender"]').selectOption("Feminino");
  await page
    .getByRole("dialog")
    .locator('select[name="schoolId"]')
    .selectOption(tables.schools[0].id);
  await page.locator('select[name="position"]').selectOption("Técnico");
  await page
    .getByRole("button", { name: "Salvar profissional", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(tables.people.length, 1, "Profissão duplicou pessoa");
  await page.getByRole("button",{name:"Editar Atleta conectado",exact:true}).click();
  await page.getByRole("img",{name:"Prévia da foto de identificação"}).waitFor();
  await page.getByRole("button",{name:"Fechar cadastro",exact:true}).click();

  assert.equal(
    await page.getByText("Área de trabalho:", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Escolas", exact: true }).click();
  await page.getByRole("button", { name: "Acompanhar", exact: true }).click();
  await page
    .getByRole("button", { name: "Trabalhar neste evento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Trocar evento", exact: true })
    .waitFor();
  isAdmin=false;
  await page.goto(origin+'/escola/'+tenant+'/escolas/'+tables.schools[0].id+'/atletas');
  await page.getByRole('button',{name:'Dados da escola',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Usuários da Secretaria',exact:true}).count(),0);
  await page
    .getByRole("button", { name: "Editar Atleta conectado", exact: true })
    .click();
  await page.getByRole("img",{name:"Prévia da foto de identificação"}).waitFor();
  await page.getByLabel("Foto de identificação",{exact:true}).setInputFiles({name:"foto-atualizada.png",mimeType:"image/png",buffer:portrait});
  await page.getByRole("button",{name:"Cancelar alteração",exact:true}).waitFor();
  await page.screenshot({path:"/tmp/siep-person-photo-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"/tmp/siep-person-photo-mobile.png",fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1440,height:1000});

  const guardianSection=page.getByRole('region',{name:'Dados do responsável legal',exact:true});
  await guardianSection.waitFor();
  const beforeIncomplete=tables.event_participations.length;
  assert.equal(await page.getByRole('region',{name:'Pendências do cadastro',exact:true}).count(),0,'Resumo apareceu antes de tentar concluir');
  await page.getByRole('button',{name:'Concluir cadastro',exact:true}).click();
  await page.getByRole('region',{name:'Pendências do cadastro',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Pendências do cadastro');
  assert.equal(tables.event_participations.length,beforeIncomplete,'Cadastro incompleto foi enviado ao servidor');
  assert.equal(await page.locator('input[name=guardian_name]').getAttribute('aria-invalid'),'true');
  await page.getByRole('button',{name:'Preencha nome completo do responsável.',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement.name==='guardian_name');
  const pendingModal=page.getByRole('dialog');
  await pendingModal.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'/tmp/siep-guardian-pending-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/siep-guardian-pending-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  const originalBirth=await page.getByLabel('Data de nascimento *',{exact:true}).inputValue();
  await page.getByLabel('Data de nascimento *',{exact:true}).fill('2008-12-01');
  await guardianSection.waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:'Preencha nome completo do responsável.',exact:true}).count(),0);
  await page.getByLabel('Data de nascimento *',{exact:true}).fill(originalBirth);
  await guardianSection.waitFor();
  await page.getByLabel('Nome completo do responsável *',{exact:true}).fill('Maria de Oliveira');
  await page.getByLabel('CPF do responsável *',{exact:true}).fill('52998224725');
  assert.equal(await page.locator('input[name=guardian_cpf]').getAttribute('aria-invalid'),'true');
  await page.getByLabel('CPF do responsável *',{exact:true}).fill('11144477735');
  await page.getByLabel('Parentesco *',{exact:true}).selectOption('Mãe');
  await page.getByLabel('Telefone do responsável *',{exact:true}).fill('(95) 99999-8888');
  assert.equal(await page.getByLabel('Nome completo *',{exact:true}).inputValue(),'Atleta conectado');
  await page.getByRole("checkbox", { name: /Futsal · 12 a 14 anos/ }).check();
  await page.getByLabel("Anexar Foto", { exact: true }).setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake-image"),
  });
  await page.getByRole('region',{name:'Pendências do cadastro',exact:true}).waitFor({state:'detached'});
  await page
    .getByRole("button", { name: "Concluir cadastro", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByText("Cadastro completo", { exact: true }).waitFor();
  assert.equal(tables.event_participations[0].additional_data.guardian_name,'Maria de Oliveira');
  assert.equal(tables.event_participations[0].additional_data.guardian_cpf,'11144477735');
  assert.equal(tables.people[0].contact?.guardian_name,undefined);
  assert.equal(tables.person_photos.filter(p=>p.is_current).length,1);
  assert.equal(tables.person_photos.filter(p=>p.status==='superseded').length,1);
  assert.equal(
    tables.participant_documents.filter((d) => d.status === "uploaded").length,
    1,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("siep-athletes")),
    null,
  );
  await page
    .getByRole("button", { name: "Minhas inscrições", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nova inscrição neste evento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .first()
    .selectOption(tables.event_categories[0].id);
  await page
    .getByLabel("Atleta 1", { exact: true })
    .selectOption(tables.event_participations[0].id);
  await page
    .getByRole("button", { name: "Salvar rascunho no banco", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(tables.registrations.length, 1);
  await page
    .getByRole("button", { name: "Enviar para análise", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("cell", { name: "Enviada", exact: true }).waitFor();
  isAdmin=true;
  await page.goto(origin+'/secretaria/'+tenant+'/inscricoes');
  await page.getByRole('button',{name:'Solicitar correção',exact:true}).click();
  await page.getByLabel('Justificativa *',{exact:true}).fill('Conferir elenco e reenviar para análise');
  const future=new Date(Date.now()+7*86400000).toISOString().slice(0,16);
  await page.getByLabel('Prazo para correção *',{exact:true}).fill(future);
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('cell',{name:'Correção solicitada',exact:true}).waitFor();
  isAdmin=false;
  await page.goto(origin+'/escola/'+tenant+'/escolas/'+tables.schools[0].id+'/inscricoes');
  await page.getByRole('cell',{name:'Correção solicitada',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Aprovar',exact:true}).count(),0);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Atleta 1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Salvar rascunho no banco',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Enviar para análise',exact:true}).click();
  await page.getByLabel('Justificativa *',{exact:true}).fill('Elenco conferido e inscrição corrigida');
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('cell',{name:'Enviada',exact:true}).waitFor();
  isAdmin=true;
  await page.goto(origin+'/secretaria/'+tenant+'/inscricoes');
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  await page.getByLabel("Justificativa *", { exact: true }).fill("Conferido");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("cell", { name: "Aprovada", exact: true }).waitFor();
  assert.deepEqual(registrationTransitions,[
    {from:'draft',to:'submitted',actor:'escola'},
    {from:'submitted',to:'correction_requested',actor:'secretaria'},
    {from:'correction_requested',to:'submitted',actor:'escola'},
    {from:'submitted',to:'approved',actor:'secretaria'},
  ]);
  const registration=tables.registrations[0];
  tables.registration_versions.push({id:randomUUID(),institution_id:tenant,registration_id:registration.id,revision:registration.revision,status:'approved',created_at:new Date().toISOString(),snapshot:{athletes:[{person:{id:tables.people[0].id,full_name:'Atleta conectado'},allocation:{slot_number:1}}],staff:[]}});
  tables.registration_decisions.push({id:randomUUID(),institution_id:tenant,registration_id:registration.id,to_status:'approved',reason:'Conferido no histórico',created_at:new Date().toISOString()});
  await page.getByRole('button',{name:'Detalhes e histórico',exact:true}).click();
  const historyDialog=page.getByRole('dialog',{name:'Histórico da inscrição',exact:true});
  await historyDialog.waitFor();
  await historyDialog.getByText('Conferido no histórico',{exact:false}).waitFor();
  await historyDialog.getByText(/^Versão /).click();
  await historyDialog.getByText('Atleta conectado · Vaga 1',{exact:true}).waitFor();
  assert.equal(await page.getByText('all is not defined',{exact:true}).count(),0);
  await page.reload();
  await page.getByRole('dialog',{name:'Histórico da inscrição',exact:true}).getByText('Conferido no histórico',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Fechar histórico',exact:true}).click();
  await page.getByRole('dialog',{name:'Histórico da inscrição',exact:true}).waitFor({state:'detached'});
  const examplePhoto=tables.person_photos.find(p=>p.is_current&&p.person_id===tables.people[0].id);
  examplePhoto.bucket_id='siep-development-photos';examplePhoto.object_path='development/'+examplePhoto.id+'.png';
  await page.getByRole("button",{name:"Crachás",exact:true}).click();
  await page.getByLabel("Evento dos crachás",{exact:true}).selectOption(tables.events[0].id);
  await page.getByRole("checkbox",{name:"Selecionar Atleta conectado · Atleta",exact:true}).check();
  const badgePopupPromise=page.waitForEvent('popup');
  await page.getByRole("button",{name:"Emitir e abrir impressão",exact:true}).click();
  const badgePopup=await badgePopupPromise;
  await badgePopup.locator('.event-badge').waitFor();
  assert.equal(await badgePopup.locator('.event-badge').count(),1);
  await badgePopup.getByText('Atleta conectado',{exact:true}).waitFor();
  await badgePopup.getByText('Escola conectada',{exact:true}).waitFor();
  assert.equal((await badgePopup.locator('body').innerText()).includes('52998224725'),false);
  await badgePopup.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
  await badgePopup.evaluate(()=>{window.print=()=>{window.printInvoked=true;};});
  await badgePopup.getByRole('button',{name:'Imprimir / Salvar PDF',exact:true}).click();
  assert.equal(await badgePopup.evaluate(()=>window.printInvoked),true);
  await badgePopup.screenshot({path:'/tmp/siep-badge-preview.png',fullPage:true});
  await badgePopup.pdf({path:'/tmp/siep-roundtrip-badge.pdf',preferCSSPageSize:true,printBackground:true});
  await badgePopup.close();
  await page.getByRole('button',{name:'Reimprimir',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/siep-badges-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/siep-badges-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  const reprintPopupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Reimprimir',exact:true}).click();
  const reprintPopup=await reprintPopupPromise;
  await reprintPopup.locator('.event-badge').waitFor();await reprintPopup.close();
  assert.equal(tables.event_badges.length,1,'Reimprimir criou nova emissão');
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  const resultTable=page.getByRole('table',{name:'Resultado do relatório'});
  await resultTable.getByText('Atleta conectado',{exact:true}).first().waitFor();
  await page.getByLabel('Evento do relatório',{exact:true}).selectOption(tables.events[0].id);
  await page.getByLabel('Escola do relatório',{exact:true}).selectOption(tables.schools[0].id);
  await page.getByLabel('Sexo',{exact:true}).selectOption('Masculino');
  await resultTable.getByText(/Nenhum registro encontrado/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Exportar PDF',exact:true}).isDisabled(),true);
  await page.getByLabel('Sexo',{exact:true}).selectOption('Feminino');
  await resultTable.getByText('Atleta conectado',{exact:true}).first().waitFor();
  await page.getByLabel('Categoria',{exact:true}).selectOption(tables.registrations[0].category_id);
  await resultTable.getByText('Atleta conectado',{exact:true}).first().waitFor();
  assert.equal(await resultTable.getByRole('columnheader',{name:'CPF',exact:true}).count(),0);
  const csvDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();
  await (await csvDownload).saveAs('/tmp/siep-relatorio.csv');
  assert.ok(fs.readFileSync('/tmp/siep-relatorio.csv','utf8').includes('Atleta conectado'));
  const pdfDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();
  await (await pdfDownload).saveAs('/tmp/siep-relatorio.pdf');
  assert.equal(fs.readFileSync('/tmp/siep-relatorio.pdf').subarray(0,4).toString(),'%PDF');
  await page.getByLabel('Apresentação do relatório',{exact:true}).selectOption('gender');
  await resultTable.getByText('Feminino',{exact:true}).waitFor();
  await page.getByLabel('Apresentação do relatório',{exact:true}).selectOption('school');
  await resultTable.getByText('Escola conectada',{exact:true}).waitFor();
  await page.getByLabel('Apresentação do relatório',{exact:true}).selectOption('');
  await page.screenshot({path:'/tmp/siep-reports-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/siep-reports-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  for (const type of ['registrations','athletes','staff','staffEntries','responsibles','schools','events']) {
    await page.getByLabel('Tipo de relatório',{exact:true}).selectOption(type);
    await resultTable.waitFor();
  }
  if(process.env.SIEP_SCALE_BROWSER)await require('./test_scale_browser.cjs')({page,tables,tenant,queryCalls});
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  await page
    .getByText("Nenhuma notificação recebida.", { exact: true })
    .waitFor();
  await page.getByRole("button",{name:"Responsáveis",exact:true}).click();
  await page.getByRole("button",{name:"Cadastrar responsável",exact:true}).click();
  await page.getByLabel("Nome completo *",{exact:true}).fill("Responsável com foto");
  await page.getByLabel("CPF *",{exact:true}).fill("11144477735");
  await page.getByLabel("Data de nascimento *",{exact:true}).fill("1990-01-01");
  await page.locator('select[name="gender"]').selectOption("Masculino");
  await page.locator('select[name="schoolId"]').selectOption(tables.schools[0].id);
  await page.getByLabel("Cargo ou função *",{exact:true}).fill("Diretor");
  await page.getByLabel("Foto de identificação",{exact:true}).setInputFiles({name:"responsavel.png",mimeType:"image/png",buffer:portrait});
  await page.getByRole("img",{name:"Prévia da foto de identificação"}).waitFor();
  await page.getByRole("button",{name:"Salvar responsável",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"detached"});
  const responsiblePerson=tables.people.find(p=>p.full_name==='Responsável com foto');
  assert.ok(tables.person_photos.some(p=>p.person_id===responsiblePerson.id&&p.is_current));
  await page.getByRole("button",{name:"Editar responsável Responsável com foto",exact:true}).click();
  await page.getByRole("img",{name:"Prévia da foto de identificação"}).waitFor();
  await page.getByRole("button",{name:"Remover foto",exact:true}).click();
  await page.getByRole("button",{name:"Salvar responsável",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"detached"});
  assert.equal(tables.person_photos.some(p=>p.person_id===responsiblePerson.id&&p.is_current),false);
  assert.ok(tables.person_photos.some(p=>p.person_id===responsiblePerson.id&&p.status==='superseded'));
  await page.getByRole("button",{name:"Notificações",exact:true}).click();
  const retainedPath = new URL(page.url()).pathname;
  await page.reload();
  await page
    .getByRole("heading", { name: "Notificações da minha conta", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, retainedPath);
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo evento", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("siep-events"))[0].name,
    ),
    "Evento local preservado",
  );
  await page.screenshot({
    path: "/tmp/siep-connected-desktop.png",
    fullPage: true,
  });
  if (process.env.SIEP_LAYOUT_AUDIT) await require("./audit_layout.cjs")({page,tenant,schoolId:tables.schools[0].id,eventId:tables.events[0].id,registrationId:tables.registrations[0]?.id,area:"secretaria"});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/siep-connected-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Overflow mobile",
  );
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await page.getByRole("heading", { name: "Acessar o SIEP" }).waitFor();
  isAdmin = false;
  user.user_metadata = { role: "admin", is_admin: true };
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste-longa");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Dados da escola", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Novo evento", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Dados da escola", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Cadastrar escola", exact: true })
      .count(),
    0,
  );
  assert.ok(new URL(page.url()).pathname.startsWith("/escola/"));
  if (process.env.SIEP_LAYOUT_AUDIT) await require("./audit_layout.cjs")({page,tenant,schoolId:tables.schools[0].id,eventId:tables.events[0].id,registrationId:tables.registrations[0]?.id,area:"escola"});
  await page.goto(
    origin + "/secretaria/" + tenant + "/instituicao",
  );
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto(
    origin + "/escola/" +
      tenant +
      "/escolas/99999999-9999-4999-8999-999999999999/atletas",
  );
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto(origin + "/rota-inexistente");
  await page
    .getByRole("heading", { name: "Página não encontrada", exact: true })
    .waitFor();
  isManager = true;
  await page.goto(origin + "/secretaria/" + tenant + "/usuarios");
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto(origin + "/secretaria/" + tenant + "/eventos");
  await page
    .getByRole("button", { name: "Novo evento", exact: true })
    .waitFor();
  isAdmin = true;
  isManager = false;
  await page.goto(origin + "/secretaria/" + tenant + "/usuarios");
  await page
    .getByRole("heading", {
      name: "Usuários da Secretaria",
      level: 1,
      exact: true,
    })
    .waitFor();
  isAdmin = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name: "Acesso não autorizado", exact: true })
    .waitFor();
  await page.goto(
    origin + "/entrar?retorno=https://example.invalid",
  );
  await page.getByRole("button", { name: "Abrir menu", exact: true }).waitFor();
  assert.equal(new URL(page.url()).origin, origin);
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Acessar o SIEP", exact: true })
    .waitFor();
  await page.goBack();
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  assert.ok(new URL(page.url()).pathname.includes("entrar"));
  assert.equal(
    await page
      .getByRole("button", { name: "Cadastrar atleta", exact: true })
      .count(),
    0,
  );
  await page.goto(origin + "/secretaria/" + tenant + "/atletas");
  await page
    .getByRole("heading", { name: "Acessar o SIEP", exact: true })
    .waitFor();
  assert.equal(
    new URL(page.url()).searchParams.get("retorno"),
    "/secretaria/" + tenant + "/atletas",
  );
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByText("E-mail ou senha inválidos.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Novo evento", exact: true })
      .count(),
    0,
  );
  await page.goto(origin + "/redefinir-senha");
  await page
    .getByRole("heading", { name: "Recuperar acesso", exact: true })
    .waitFor();
  await page
    .getByText(
      "O link de recuperação expirou ou já foi utilizado. Solicite novas instruções.",
      { exact: true },
    )
    .waitFor();
  await page.goto(origin + '/escola/entrar');
  await page.getByLabel(/^(E-mail|CPF ou e-mail)$/).fill(user.email);
  await page.getByLabel('Senha',{exact:true}).fill('senha-de-teste-longa');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).waitFor();
  await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'));const session=JSON.parse(localStorage.getItem(key));session.expires_at=1;session.refresh_token='expired-test';localStorage.setItem(key,JSON.stringify(session));});
  await page.reload();
  await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Cadastrar atleta',exact:true}).count(),0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: navegação completa, login/recuperação, escola, atleta/profissional sem duplicação, documento privado, cadastro na edição, inscrição pela escola, envio, correção pela Secretaria, reenvio pela escola, aprovação, relatórios, notificações, recarga, permissões, mobile e demo preservada; URLs, recarga, acesso negado, gestor/admin, vínculo escolar, revogação, logout/voltar e redirect seguro; API simulada.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
