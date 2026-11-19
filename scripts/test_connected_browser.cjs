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
  const {defaultBadgeLayout}=await import('../src/badgeTemplates.js');
  const {mapPortalData}=await import('../src/data/peopleMapping.js');
  const {fromEvent}=await import('../src/data/eventMapping.js');
  const {buildReport,groupRows,sortRows,normalize}=await import('../src/reports/model.js');
  const queryCalls=[];
  const staffReviews=new Map(),developmentImages=new Map();
  let notificationFailure=false,completionIssues=[],loseCompletionResponse=false;
  const completionReceipts=new Map(),badgeTemplates=new Map(),defaultBadgeTemplates=new Map(),artAssets=new Map();
  const persistedBadgeArt=new Map();
  let nextArtBytes=null,templateServiceMissing=false;
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
  function staffBadgeAllowed(event,school,person){
    const assignments=tables.registration_staff.filter(a=>a.event_id===event&&a.school_id===school&&a.person_id===person.id);
    const roles=[...new Set(assignments.map(a=>a.staff_role_id))].map(id=>({id,name:tables.event_staff_roles.find(r=>r.id===id)?.name||'Técnico'}));
    const f=tables.person_photos.find(f=>f.person_id===person.id&&f.is_current),photo=f?{id:f.id,bucket:f.bucket_id,objectPath:f.object_path,name:f.original_name}:null;
    const review=staffReviews.get([event,school,person.id].join(':'));
    return review?.status==='approved'&&review.fingerprint===JSON.stringify([person,photo,roles]);
  }
  function recordTransition(r,status,reason,deadline){
    registrationTransitions.push({from:r.status,to:status,actor:isAdmin||isManager?'secretaria':'escola'});
    tables.notifications.push({id:randomUUID(),institution_id:tenant,audience:status==='submitted'?'secretaria':'escola',kind:status==='submitted'?'registration_submitted':'registration_status',payload:{registration_id:r.id,school_id:r.school_id,school_name:tables.schools.find(s=>s.id===r.school_id)?.name,event_name:tables.events.find(e=>e.id===r.event_id)?.name,status,resubmitted:r.status==='correction_requested',deadline},created_at:new Date().toISOString(),read_at:null});
    tables.registration_decisions.push({id:randomUUID(),institution_id:tenant,registration_id:r.id,from_status:r.status,to_status:status,reason,created_at:new Date().toISOString()});
    r.status=status;r.correction_deadline=deadline||r.correction_deadline;r.revision++;
  }
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
        const match=url.pathname.match(/\/storage\/v1\/object\/(?:authenticated\/)?(siep-documents|siep-person-photos|siep-badge-art)\/(.*)/);
        const bucket=match?.[1],path=match?.[2];
        if (method === "POST") { uploadedPaths.add(path); return response(route, { Key: bucket+"/"+path, Id: randomUUID() }); }
        return route.fulfill({ status:200, body:bucket==='siep-badge-art'?[...artAssets.values()].find(a=>a.path===path)?.bytes||portrait:portrait,contentType:"image/png" });
      }
      const table = url.pathname.split("/").at(-1);
      if(templateServiceMissing&&['siep_badge_history','siep_badge_template'].includes(table))return response(route,{code:'PGRST202',message:'Function not found'},404);
      if(table==='siep_badge_history')return response(route,tables.event_badges.filter(b=>b.institution_id===body.p_institution_id&&b.event_id===body.p_event_id&&(!body.p_school_id||b.school_id===body.p_school_id)).sort((a,b)=>b.issued_at.localeCompare(a.issued_at)).slice(0,100));
      if(table==='siep_default_badge_template')return response(route,defaultBadgeTemplates.get(body.p_role)||null);
      if(table==='siep_save_default_badge_template'){
        assert.equal(body.p_institution_id,tenant);
        const old=defaultBadgeTemplates.get(body.p_role);
        if((old?.version||0)!==body.p_expected_version)return response(route,{code:'40001',message:'Modelo alterado'},409);
        const model={id:old?.id||randomUUID(),version_id:randomUUID(),version:(old?.version||0)+1,role:body.p_role,layout:structuredClone(body.p_layout),background:null,reverse_background:null};
        defaultBadgeTemplates.set(body.p_role,model);return response(route,model);
      }
      if(table==='siep_badge_template')return response(route,badgeTemplates.get(body.p_event_id+':'+body.p_role)||null);
      if(table==='siep_prepare_badge_art'){const id=randomUUID(),a={id,bucket:'siep-badge-art',path:tenant+'/'+body.p_event_id+'/'+id+'.png',name:body.p_name,bytes:persistedBadgeArt.get(body.p_name)||nextArtBytes||portrait,status:'pending'};artAssets.set(id,a);return response(route,{id,bucket:a.bucket,path:a.path});}
      if(table==='siep_finalize_badge_art'){const a=artAssets.get(body.p_art_id);assert.ok(uploadedPaths.has(a.path));a.status='uploaded';return response(route,null);}
      if(table==='siep_save_badge_template'){
        const key=body.p_event_id+':'+body.p_role,old=badgeTemplates.get(key);
        if((old?.version||0)!==body.p_expected_version)return response(route,{code:'40001',message:'Modelo alterado'},409);
        const attachment=id=>{
          const asset=artAssets.get(id);
          return asset?{id:asset.id,bucket:asset.bucket,objectPath:asset.path,name:asset.name}:null;
        };
        const model={id:old?.id||randomUUID(),version_id:randomUUID(),version:(old?.version||0)+1,role:body.p_role,layout:structuredClone(body.p_layout),background:attachment(body.p_background_id),reverse_background:attachment(body.p_reverse_background_id)};
        badgeTemplates.set(key,model);return response(route,model);
      }
      if(['siep_staff_conference_page','siep_staff_conference_detail','siep_review_staff'].includes(table)){
        queryCalls.push({table,body});
        if(body.p_institution_id!==tenant)return response(route,{message:'Acesso negado'},403);
        const candidates=new Map();
        for(const a of tables.registration_staff){
          const key=[a.event_id,a.school_id,a.person_id].join(':');
          if(candidates.has(key))continue;
          const p=tables.people.find(p=>p.id===a.person_id),link=tables.school_people.find(l=>l.person_id===a.person_id&&l.school_id===a.school_id&&l.role==='staff');
          if(!p||!link)continue;
          const assignments=tables.registration_staff.filter(x=>x.person_id===a.person_id&&x.school_id===a.school_id&&x.event_id===a.event_id);
          const roles=[...new Set(assignments.map(x=>x.staff_role_id))].map(id=>({id,name:tables.event_staff_roles.find(r=>r.id===id)?.name||'Técnico'}));
          const f=tables.person_photos.find(f=>f.person_id===p.id&&f.is_current),photo=f?{id:f.id,bucket:f.bucket_id,objectPath:f.object_path,name:f.original_name}:null;
          const fingerprint=JSON.stringify([p,photo,roles]),review=staffReviews.get(key);
          candidates.set(key,{event_id:a.event_id,school_id:a.school_id,person_id:p.id,link_id:link.id,person:p,roles,photo,fingerprint,event_name:tables.events.find(e=>e.id===a.event_id)?.name,school_name:tables.schools.find(s=>s.id===a.school_id)?.name,registration_count:new Set(assignments.map(x=>x.registration_id)).size,active:!p.archived&&!link.archived&&link.status==='approved',revision:review?.revision||0,status:review?.fingerprint===fingerprint?review.status:'pending',outdated:!!review&&review.fingerprint!==fingerprint,last_reason:review?.last_reason,history:review?.history||[]});
        }
        if(table==='siep_staff_conference_page'){
          const f=body.p_filters||{};let rows=[...candidates.values()].filter(r=>(!body.p_school_id||r.school_id===body.p_school_id)&&(!f.eventId||r.event_id===f.eventId)&&(!f.schoolId||r.school_id===f.schoolId)&&(!f.status||f.status==='all'||r.status===f.status)&&(!f.query||[r.person.full_name,r.person.cpf,r.school_name].join(' ').toLowerCase().includes(f.query.toLowerCase())));
          return response(route,{total:rows.length,rows:rows.slice(body.p_offset,body.p_offset+body.p_limit)});
        }
        const key=[body.p_event_id,body.p_school_id,body.p_person_id].join(':'),row=candidates.get(key);
        if(!row)return response(route,{message:'Profissional indisponível'},404);
        if(table==='siep_staff_conference_detail')return response(route,row);
        if(!isAdmin&&!isManager)return response(route,{message:'Somente a Secretaria pode decidir'},403);
        if(body.p_expected_revision!==row.revision||body.p_fingerprint!==row.fingerprint)return response(route,{code:'40001',message:'Cadastro alterado; recarregue a conferência'},409);
        const review={...row,revision:row.revision+1,status:body.p_status,last_reason:body.p_reason,history:[{id:randomUUID(),revision:row.revision+1,status:body.p_status,reason:body.p_reason,snapshot:structuredClone(row),created_at:new Date().toISOString()},...row.history]};
        staffReviews.set(key,review);return response(route,review);
      }
      if(table==='siep_notification_center'){
        if(notificationFailure)return response(route,{message:'Falha simulada'},503);
        const rows=tables.notifications.filter(n=>!n.audience||n.audience===(isAdmin||isManager?'secretaria':'escola')).sort((a,b)=>b.created_at.localeCompare(a.created_at));
        return response(route,{rows:rows.slice(0,10),unread:rows.filter(n=>!n.read_at).length});
      }
      if(table==='siep_mark_notification_read'){
        const notification=tables.notifications.find(n=>n.id===body.p_notification_id);
        if(notification)notification.read_at=notification.read_at||new Date().toISOString();
        return response(route,null);
      }

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
        return response(route,{mime_type:'image/png',base64:(developmentImages.get(body.p_path)||portrait).toString('base64')});
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
            if(role==='staff'&&!staffBadgeAllowed(body.p_event_id,school.id,person))continue;
            const row={person_id:person.id,school_id:school.id,role,role_label:role==='athlete'?'Atleta':'Comissão técnica',person_name:person.full_name,school_name:school.name,photo_id:photo?.id||null,photo_bucket:photo?.bucket_id,photo_path:photo?.object_path};
            eligible.set([school.id,person.id,role].join(':'),row);
          }
        }
        const all=[...eligible.values()].filter(r=>normalize(r.person_name+' '+r.school_name).includes(normalize(body.p_query||'')));
        return response(route,{rows:all.slice(body.p_offset,body.p_offset+body.p_limit),total:all.length});
      }
      if (table === "siep_issue_event_badges") {
        const event=tables.events.find(e=>e.id===body.p_event_id),issued=[];
        if(body.p_entries.some(e=>e.role==='staff'&&!staffBadgeAllowed(body.p_event_id,e.school_id,tables.people.find(p=>p.id===e.person_id))))return response(route,{message:'Conferência técnica não aprovada ou desatualizada'},400);
        for(const entry of body.p_entries){
          const person=tables.people.find(p=>p.id===entry.person_id),school=tables.schools.find(s=>s.id===entry.school_id),photo=tables.person_photos.find(p=>p.person_id===person.id&&p.is_current);
          const previous=tables.event_badges.filter(b=>b.event_id===event.id&&b.school_id===school.id&&b.person_id===person.id&&b.role===entry.role);
          for(const badge of previous)badge.is_current=false;
          const badge={id:randomUUID(),institution_id:tenant,event_id:event.id,person_id:person.id,school_id:school.id,role:entry.role,photo_id:photo.id,version:previous.length+1,is_current:true,issued_at:new Date().toISOString(),snapshot:{event_name:event.name,edition:event.edition,institution_name:'IDJUV',person_name:person.full_name,school_name:school.name,role_label:entry.role==='athlete'?'Atleta':'Comissão técnica',photo_bucket:photo.bucket_id,photo_path:photo.object_path}};
          const override=badgeTemplates.get(event.id+':'+entry.role);
          if(!override&&!defaultBadgeTemplates.has(entry.role)){
            defaultBadgeTemplates.set(entry.role,{id:randomUUID(),version_id:randomUUID(),version:1,layout:defaultBadgeLayout(entry.role)});
          }
          badge.snapshot.badge_template=structuredClone(override||defaultBadgeTemplates.get(entry.role));
          const assignments=entry.role==='staff'?tables.registration_staff:tables.registration_athletes;
          const categories=tables.registrations.filter(r=>r.event_id===event.id&&r.school_id===school.id&&r.status==='approved'&&assignments.some(a=>a.registration_id===r.id&&a.person_id===person.id)).map(r=>tables.event_categories.find(c=>c.id===r.category_id)).filter(Boolean);
          badge.snapshot.modalities=[...new Set(categories.map(c=>tables.event_modalities.find(m=>m.id===c.modality_id)?.name).filter(Boolean))].join(' / ');
          badge.snapshot.categories=[...new Set(categories.map(c=>c.name))].join(' / ');
          if(entry.role==='staff')badge.snapshot.cref=tables.school_people.find(l=>l.person_id===person.id&&l.school_id===school.id&&l.role==='staff')?.professional_registration;
          badge.snapshot.functions=entry.role==='staff'?'Técnico':'Responsável escolar';
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
            updated_at:new Date().toISOString(),
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
        part.updated_at=new Date().toISOString();
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
      if (table === "siep_save_registration" || table === "siep_complete_registration") {
        const completing=table==='siep_complete_registration';
        if(completing){queryCalls.push({table,body});if(completionReceipts.has(body.p_request_id))return response(route,completionReceipts.get(body.p_request_id));}
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
        if(completing && !completionIssues.length)recordTransition(r,'submitted','Inscrição concluída pela escola');
        const result={id:r.id,status:r.status,revision:r.revision,issues:completing?completionIssues:[],saved:true,submitted:completing&&!completionIssues.length};
        if(completing)completionReceipts.set(body.p_request_id,structuredClone(result));
        if(completing && loseCompletionResponse){loseCompletionResponse=false;return response(route,{message:'Resposta perdida após gravar'},503);}
        return response(route,result);
      }

      if (table === "siep_transition_registration") {
        const r = tables.registrations.find(
          (r) => r.id === body.p_registration_id,
        );
        if(!isAdmin&&!isManager&&['approved','rejected','correction_requested'].includes(body.p_status))return response(route,{code:'42501',message:'Somente a Secretaria pode analisar'},403);
        recordTransition(r,body.p_status,body.p_reason,body.p_correction_deadline);
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
    buffer: portrait,
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
  completionIssues=['category_roster'];
  await page.getByRole('button',{name:'Concluir inscrição',exact:true}).click();
  const schoolRegistrationForm=page.getByRole('dialog',{name:'Inscrição no evento',exact:true});
  await schoolRegistrationForm.getByText('Confira o mínimo e o máximo de atletas da categoria.',{exact:true}).waitFor();
  assert.equal(await schoolRegistrationForm.getByRole('alert').evaluate(el=>el===document.activeElement),true);
  assert.equal(tables.registrations.length,1);assert.equal(tables.registrations[0].status,'draft');
  assert.equal(await schoolRegistrationForm.getByRole('combobox').first().isDisabled(),true);
  assert.equal(await schoolRegistrationForm.getByLabel('Atleta 1',{exact:true}).inputValue(),tables.event_participations[0].id);
  completionIssues=[];
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  await schoolRegistrationForm.waitFor({state:'detached'});
  await page.getByText('Ainda não enviado à Secretaria',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Enviar para análise',exact:true}).count(),0);
  await page.getByRole('table').getByRole('button',{name:'Concluir inscrição',exact:true}).click();
  loseCompletionResponse=true;
  await schoolRegistrationForm.getByRole('button',{name:'Concluir inscrição',exact:true}).click();
  await schoolRegistrationForm.getByRole('alert').waitFor();
  await schoolRegistrationForm.getByRole('button',{name:'Concluir inscrição',exact:true}).click();
  await schoolRegistrationForm.waitFor({state:'detached'});
  assert.equal(tables.registrations.length,1);
  assert.equal(registrationTransitions.filter(t=>t.to==='submitted').length,1);
  const completeCalls=queryCalls.filter(call=>call.table==='siep_complete_registration');
  assert.equal(new Set(completeCalls.map(call=>call.body.p_request_id)).size,2);
  assert.equal(completeCalls.at(-1).body.p_request_id,completeCalls.at(-2).body.p_request_id);
  await page.getByText('Inscrição enviada com sucesso. Aguarde a análise da Secretaria.',{exact:true}).waitFor();
  await page.getByRole('cell',{name:'Enviada',exact:true}).waitFor();
  isAdmin=true;
  await page.goto(origin+'/secretaria/'+tenant+'/inscricoes');
  await page.getByRole('button',{name:/^(Detalhes e histórico|Conferir inscrição|Ver inscrição)$/}).click();
  const reviewDialog=page.getByRole('dialog',{name:'Análise da inscrição',exact:true});
  await reviewDialog.getByRole('tab',{name:'Conferência',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/siep-registration-review-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/siep-registration-review-mobile.png',fullPage:true});
  assert.equal(await reviewDialog.evaluate(el => el.scrollWidth > el.clientWidth+1),false);
  await page.setViewportSize({width:1440,height:1000});
  await reviewDialog.getByAltText('Foto de identificação do cadastro').waitFor();
  await page.waitForFunction(()=>{const img=document.querySelector('.review-document-image');return img?.complete&&img.naturalWidth>0;});
  await reviewDialog.getByLabel('O que precisa de correção em Atleta conectado?',{exact:true}).fill('Conferir elenco e reenviar para análise');
  const correctionDocument=tables.document_requirements[0];
  await reviewDialog.getByLabel(`O que precisa de correção em Atleta conectado — ${correctionDocument.name}?`,{exact:true}).fill('Confira o comprovante enviado');
  await reviewDialog.getByRole('button',{name:'Solicitar correção',exact:true}).click();
  assert.ok((await page.getByLabel('Justificativa *',{exact:true}).inputValue()).includes('Atleta conectado: Conferir elenco e reenviar para análise'));
  await page.getByRole('button',{name:'Voltar',exact:true}).click();
  assert.equal(await reviewDialog.getByLabel('O que precisa de correção em Atleta conectado?',{exact:true}).inputValue(),'Conferir elenco e reenviar para análise');
  await reviewDialog.getByRole('button',{name:'Solicitar correção',exact:true}).click();
  const future=new Date(Date.now()+7*86400000).toISOString().slice(0,16);
  await page.getByLabel('Prazo para correção *',{exact:true}).fill(future);
  await page.getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByRole('dialog',{name:'Solicitar correção',exact:true}).waitFor({state:'detached'});
  await page.getByRole('button',{name:'Fechar histórico',exact:true}).click();
  await page.getByRole('cell',{name:/^Correção solicitada/}).waitFor();
  isAdmin=false;
  const schoolPdfFixture=tables.registrations[0], originalRegistrationCount=tables.registrations.length;
  const pdfSport={id:randomUUID(),event_id:schoolPdfFixture.event_id,institution_id:tenant,name:'Atletismo',classification:'individual',enabled:true};
  const pdfCategory={...tables.event_categories[0],id:randomUUID(),modality_id:pdfSport.id};
  tables.event_modalities.push(pdfSport);
  tables.event_categories.push(pdfCategory);
  await page.goto(origin+'/escola/'+tenant+'/escolas/'+tables.schools[0].id+'/inscricoes');
  await page.getByRole('cell',{name:/^Correção solicitada/}).waitFor();
  assert.equal(await page.getByLabel('Tipo de conferência',{exact:true}).count(),0);
  await page.goto(page.url()+'?tipo=comissao');
  await page.getByRole('cell',{name:/^Correção solicitada/}).waitFor();
  assert.equal(await page.getByLabel('Tipo de conferência',{exact:true}).count(),0);
  assert.equal(await page.getByRole('region',{name:'Conferência da comissão técnica'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Aprovar',exact:true}).count(),0);
  const athleticsRegistration={...schoolPdfFixture,id:randomUUID(),category_id:pdfCategory.id,proof_id:null};
  const pdfStaffLink=tables.school_people.find(link=>link.role==='staff'&&link.school_id===schoolPdfFixture.school_id);
  assert.ok(pdfStaffLink);
  const pdfStaffName=tables.people.find(person=>person.id===pdfStaffLink.person_id).full_name;
  tables.registration_staff.push({registration_id:athleticsRegistration.id,person_id:pdfStaffLink.person_id});
  tables.registrations.push(
    athleticsRegistration,
    ...Array.from({length:100},()=>({...schoolPdfFixture,id:randomUUID()})),
    {...schoolPdfFixture,id:randomUUID(),school_id:randomUUID()},
    {...schoolPdfFixture,id:randomUUID(),event_id:randomUUID()},
    {...schoolPdfFixture,id:randomUUID(),status:'draft'},
  );
  await page.getByLabel('Situação das inscrições',{exact:true}).selectOption('correction_requested');
  const schoolPdfDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar relatório em PDF',exact:true}).click();
  const schoolPdfPath='/tmp/siep-inscricoes-da-escola.pdf';
  await (await schoolPdfDownload).saveAs(schoolPdfPath);
  assert.equal(fs.readFileSync(schoolPdfPath).subarray(0,4).toString(),'%PDF');
  const schoolPdfRequests=queryCalls.filter(call=>call.table==='siep_portal_page'&&call.body.p_mode==='registrations'&&call.body.p_limit===100);
  assert.deepEqual(schoolPdfRequests.map(call=>call.body.p_offset),[0,100]);
  assert.ok(schoolPdfRequests.every(({body})=>body.p_school_id===schoolPdfFixture.school_id&&body.p_filters.eventId===schoolPdfFixture.event_id&&body.p_filters.status==='correction_requested'));
  const schoolPdfText=require('node:child_process').spawnSync('pdftotext',[schoolPdfPath,'-'],{encoding:'utf8'});
  if(!schoolPdfText.error){
    assert.equal(schoolPdfText.status,0);
    for(const expected of ['Atleta conectado','Escola conectada','Futsal','Correção solicitada','Inscrições: 102','Futsal · Atletas inscritos','Atletismo · Comissão técnica',pdfStaffName])assert.ok(schoolPdfText.stdout.includes(expected),expected);
    assert.ok(!schoolPdfText.stdout.includes('52998224725'));
  }
  await page.getByLabel('Modalidade do PDF',{exact:true}).selectOption(pdfSport.id);
  const athleticsPdf=page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar relatório em PDF',exact:true}).click();
  const athleticsPdfPath='/tmp/siep-inscricoes-atletismo.pdf';
  await (await athleticsPdf).saveAs(athleticsPdfPath);
  const athleticsText=require('node:child_process').spawnSync('pdftotext',[athleticsPdfPath,'-'],{encoding:'utf8'});
  if(!athleticsText.error){
    assert.equal(athleticsText.status,0);
    assert.ok(athleticsText.stdout.includes('Atletismo · Comissão técnica'));
    assert.ok(athleticsText.stdout.includes(pdfStaffName));
    assert.ok(!athleticsText.stdout.includes('Futsal'));
  }
  tables.registrations.splice(originalRegistrationCount);
  tables.registration_staff.pop();
  tables.event_categories.pop();
  tables.event_modalities.pop();
  await page.getByLabel('Modalidade do PDF',{exact:true}).selectOption('');
  await page.getByLabel('Situação das inscrições',{exact:true}).selectOption('all');


  await page.getByRole('button',{name:'Notificações',exact:true}).click();
  const schoolBell=page.getByRole('region',{name:'Avisos recentes',exact:true});
  await schoolBell.getByText('Correção solicitada pela Secretaria',{exact:true}).waitFor();
  await schoolBell.locator('article').filter({hasText:'Correção solicitada pela Secretaria'}).getByRole('button',{name:'Abrir inscrição',exact:true}).click();
  const schoolReview=page.getByRole('dialog',{name:'Análise da inscrição',exact:true});
  await schoolReview.getByText('Atleta conectado: Conferir elenco e reenviar para análise',{exact:true}).waitFor();
  assert.equal(await schoolReview.locator('textarea').count(),0);
  await schoolReview.getByRole('button',{name:'Corrigir documento · Atleta conectado',exact:true}).click();
  const correctedForm=page.getByRole('dialog').filter({has:page.getByLabel('Nome completo *',{exact:true})});
  await correctedForm.getByText(`Atleta conectado — ${correctionDocument.name}: Confira o comprovante enviado`,{exact:true}).waitFor();
  assert.equal(await correctedForm.locator('input[type=file]:focus').count(),1);
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  await correctedForm.waitFor({state:'detached'});
  await schoolReview.getByText('Cadastro atualizado após a solicitação. Confira se atende à orientação.',{exact:true}).first().waitFor();
  assert.equal(tables.registrations[0].status,'correction_requested');
  const correctedRegistration=tables.registrations[0],savedDeadline=correctedRegistration.correction_deadline;
  correctedRegistration.correction_deadline=new Date(Date.now()-60000).toISOString();
  await page.reload();
  await schoolReview.getByText('O prazo terminou. Solicite à Secretaria a revisão do prazo antes de reenviar.',{exact:true}).waitFor();
  assert.equal(await schoolReview.getByRole('button',{name:'Salvar correções e reenviar',exact:true}).isDisabled(),true);
  correctedRegistration.correction_deadline=savedDeadline;
  await page.reload();
  await schoolReview.getByRole('button',{name:'Corrigir cadastro · Atleta conectado',exact:true}).click();
  await correctedForm.getByLabel('Nome completo *',{exact:true}).waitFor();
  assert.equal(await correctedForm.getByLabel('Nome completo *',{exact:true}).inputValue(),'Atleta conectado');
  completionIssues=['category_roster'];
  await correctedForm.getByRole('button',{name:'Salvar correções e reenviar',exact:true}).click();
  await correctedForm.waitFor({state:'detached'});
  await schoolReview.getByText('Dados salvos. A inscrição ainda não foi reenviada.',{exact:true}).waitFor();
  assert.equal(tables.registrations[0].status,'correction_requested');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/siep-school-unified-completion-mobile.png',fullPage:true});
  assert.equal(await schoolReview.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.setViewportSize({width:1440,height:1000});
  completionIssues=[];loseCompletionResponse=true;
  await schoolReview.getByRole('button',{name:'Salvar correções e reenviar',exact:true}).click();
  await schoolReview.getByRole('alert').filter({hasText:'Não foi possível confirmar o reenvio.'}).waitFor();
  await schoolReview.getByRole('button',{name:'Salvar correções e reenviar',exact:true}).click();
  await schoolReview.waitFor({state:'detached'});
  await page.getByRole('cell',{name:'Enviada',exact:true}).waitFor();
  isAdmin=true;
  await page.goto(origin+'/secretaria/'+tenant+'/inscricoes');
  await page.getByRole("button", { name: "Conferir inscrição", exact: true }).click();
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  await page.getByLabel("Justificativa *", { exact: true }).fill("Conferido");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await page.getByRole("dialog",{name:"Aprovar",exact:true}).waitFor({state:"detached"});
  await page.getByRole("button",{name:"Fechar histórico",exact:true}).click();
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
  await page.getByRole('button',{name:/^(Detalhes e histórico|Conferir inscrição|Ver inscrição)$/}).click();
  const historyDialog=page.getByRole('dialog',{name:'Análise da inscrição',exact:true});
  await historyDialog.waitFor();
  await historyDialog.getByText('Conferido no histórico',{exact:false}).waitFor();
  await historyDialog.getByRole('tab',{name:'Histórico',exact:true}).click();
  await historyDialog.getByText(/^Versão /).click();
  await historyDialog.getByText('Atleta conectado · Vaga 1',{exact:true}).waitFor();
  assert.equal(await page.getByText('all is not defined',{exact:true}).count(),0);
  await page.reload();
  await page.getByRole('dialog',{name:'Análise da inscrição',exact:true}).getByText('Conferido no histórico',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Fechar histórico',exact:true}).click();
  await page.getByRole('dialog',{name:'Análise da inscrição',exact:true}).waitFor({state:'detached'});
  // Fila curta, filtro no servidor e avanço sem voltar à listagem.
  const queueFixtures=Array.from({length:12},(_,index)=>({...registration,id:randomUUID(),status:index<2?'submitted':'cancelled',revision:1}));
  tables.registrations.push(...queueFixtures);
  const queuePerson={...tables.people[0],id:randomUUID(),full_name:'Segundo atleta da fila'};
  const queueLink={...tables.school_people.find(p=>p.role==='athlete'),id:randomUUID(),person_id:queuePerson.id};
  const queuePart={...tables.event_participations[0],id:randomUUID(),person_id:queuePerson.id};
  const queueAllocations=[{...tables.registration_athletes[0],id:randomUUID(),registration_id:queueFixtures[0].id},{...tables.registration_athletes[0],id:randomUUID(),registration_id:queueFixtures[0].id,person_id:queuePerson.id,participation_id:queuePart.id,slot_number:2}];
  tables.people.push(queuePerson);tables.school_people.push(queueLink);tables.event_participations.push(queuePart);tables.registration_athletes.push(...queueAllocations);
  await page.reload();
  await page.getByText('1 a 10 de 13',{exact:true}).waitFor();
  assert.equal(await page.locator('.registration-compact-list tbody tr').count(),10);
  await page.screenshot({path:'/tmp/siep-registration-queue-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Aguardando análise',exact:true}).click();
  await page.getByText('1 a 2 de 2',{exact:true}).waitFor();
  assert.ok(queryCalls.some(call=>call.table==='siep_portal_page'&&call.body.p_mode==='registrations'&&call.body.p_limit===10&&call.body.p_filters.status==='submitted'));
  await page.getByRole('button',{name:'Conferir inscrição',exact:true}).first().click();
  const queueReview=page.getByRole('dialog',{name:'Análise da inscrição',exact:true});
  await queueReview.getByLabel('O que precisa de correção em Atleta conectado?',{exact:true}).fill('Conferir documento');
  await queueReview.getByRole('button',{name:'Próximo atleta',exact:true}).click();
  await queueReview.getByRole('heading',{name:'Segundo atleta da fila · Vaga 2',exact:true}).waitFor();
  assert.equal(await queueReview.locator('.review-person').count(),1);
  await queueReview.getByRole('button',{name:'Atleta anterior',exact:true}).click();
  assert.equal(await queueReview.getByLabel('O que precisa de correção em Atleta conectado?',{exact:true}).inputValue(),'Conferir documento');
  await queueReview.getByRole('button',{name:'Próxima inscrição',exact:true}).click();
  await page.waitForURL('**/'+queueFixtures[1].id+'/historico');
  await queueReview.getByRole('button',{name:'Inscrição anterior',exact:true}).click();
  await page.waitForURL('**/'+queueFixtures[0].id+'/historico');
  assert.equal(await queueReview.getByLabel('O que precisa de correção em Atleta conectado?',{exact:true}).inputValue(),'Conferir documento');
  await queueReview.getByRole('button',{name:'Aprovar',exact:true}).click();
  await page.getByLabel('Justificativa *',{exact:true}).fill('Conferência da fila concluída');
  await page.getByRole('button',{name:'Confirmar e próxima inscrição',exact:true}).click();
  await page.waitForURL('**/'+queueFixtures[1].id+'/historico');
  await queueReview.waitFor();
  assert.equal(queueFixtures[0].status,'approved');
  assert.equal(queueFixtures[1].status,'submitted');
  await page.getByRole('button',{name:'Fechar histórico',exact:true}).click();
  const queueIds=new Set(queueFixtures.map(r=>r.id));
  tables.registrations=tables.registrations.filter(r=>!queueIds.has(r.id));
  tables.registration_decisions=tables.registration_decisions.filter(r=>!queueIds.has(r.registration_id));
  tables.registration_athletes=tables.registration_athletes.filter(r=>!queueIds.has(r.registration_id));
  tables.people=tables.people.filter(p=>p.id!==queuePerson.id);tables.school_people=tables.school_people.filter(p=>p.id!==queueLink.id);tables.event_participations=tables.event_participations.filter(p=>p.id!==queuePart.id);
  // A mesma pessoa em duas inscrições tem uma única conferência técnica.
  const originalAssignments=[...tables.registration_staff],extraStaffRegistration={...registration,id:randomUUID()};
  tables.registrations.push(extraStaffRegistration);
  const staffRole=tables.event_staff_roles[0]||{id:randomUUID(),event_id:registration.event_id,institution_id:tenant,name:'Técnico'};
  if(!tables.event_staff_roles.some(r=>r.id===staffRole.id))tables.event_staff_roles.push(staffRole);
  tables.registration_staff.push(...[registration.id,extraStaffRegistration.id].map(id=>({id:randomUUID(),institution_id:tenant,event_id:registration.event_id,school_id:registration.school_id,person_id:tables.people[0].id,staff_role_id:staffRole.id,registration_id:id})));
  await page.getByLabel('Tipo de conferência',{exact:true}).selectOption('comissao');
  await page.getByText('1 profissionais no evento e escola',{exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Conferência da comissão técnica',exact:true}).locator('tbody tr').count(),1);
  await page.getByText('Vinculado a 2 inscrições',{exact:true}).waitFor();
  await page.getByLabel('Evento da comissão técnica',{exact:true}).selectOption(registration.event_id);
  await page.getByLabel('Escola da comissão técnica',{exact:true}).selectOption(registration.school_id);
  await page.getByRole('button',{name:'Conferir profissional',exact:true}).click();
  const staffDialog=page.getByRole('dialog',{name:'Conferência do profissional',exact:true});
  await staffDialog.getByRole('img',{name:'Foto de identificação do cadastro',exact:true}).waitFor();
  await staffDialog.getByRole('button',{name:'Aprovar profissional',exact:true}).click();
  await staffDialog.getByLabel('Justificativa da conferência *',{exact:true}).fill('Profissional conferido separadamente');
  await staffDialog.getByRole('button',{name:'Confirmar decisão do profissional',exact:true}).click();
  await staffDialog.getByText('Aprovado',{exact:true}).waitFor();
  assert.equal(registration.status,'approved');
  assert.equal(registration.revision,tables.registrations[0].revision);
  await page.reload();
  await staffDialog.getByText('Aprovado',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/siep-staff-conference-mobile.png',fullPage:true});
  assert.equal(await staffDialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Fechar conferência técnica',exact:true}).click();
  await page.getByLabel('Situação da conferência técnica',{exact:true}).selectOption('approved');
  await page.getByRole('button',{name:'Conferir profissional',exact:true}).waitFor();
  await page.getByLabel('Buscar profissional na conferência',{exact:true}).fill('ninguém com esse nome');
  await page.getByText('Nenhum profissional vinculado a inscrições com estes filtros.',{exact:true}).waitFor();
  await page.getByLabel('Tipo de conferência',{exact:true}).selectOption('atletas');
  tables.registration_staff=originalAssignments;tables.registrations=tables.registrations.filter(r=>r.id!==extraStaffRegistration.id);
  const examplePhoto=tables.person_photos.find(p=>p.is_current&&p.person_id===tables.people[0].id);
  examplePhoto.bucket_id='siep-development-photos';examplePhoto.object_path='development/'+examplePhoto.id+'.png';
  await page.getByRole("button",{name:"Crachás",exact:true}).click();
  await page.getByRole('button',{name:'Modelo padrão da instituição',exact:true}).click();
  const defaultDialog=page.getByRole('dialog',{name:'Configurar arte do crachá',exact:true});
  await defaultDialog.getByLabel('Esquerda (mm)',{exact:true}).fill('6.5');
  await defaultDialog.getByRole('button',{name:'Salvar modelo padrão',exact:true}).click();
  await defaultDialog.getByText('Modelo padrão salvo. Será usado nos eventos sem modelo próprio.',{exact:true}).waitFor();
  await defaultDialog.getByRole('button',{name:'Fechar configuração do crachá',exact:true}).click();
  await page.getByLabel("Evento dos crachás",{exact:true}).selectOption(tables.events[0].id);
  await page.getByRole('button',{name:'Configurar arte e campos',exact:true}).click();
  const templateDialog=page.getByRole('dialog',{name:'Configurar arte do crachá',exact:true});
  await templateDialog.getByLabel('Campo do crachá',{exact:true}).waitFor();
  assert.equal(await templateDialog.getByLabel('Esquerda (mm)',{exact:true}).inputValue(),'6.5');
  await templateDialog.locator('.badge-qr').waitFor();
  assert.equal(await templateDialog.getByLabel('Verso do crachá').count(),2);
  await templateDialog.screenshot({path:'/tmp/siep-credencial-frente-verso.png'});
  await templateDialog.getByLabel('Campo do crachá',{exact:true}).selectOption('categories');
  assert.equal(await templateDialog.getByRole('button',{name:'Remover campo',exact:true}).count(),0);
  const guidePdf=page.waitForEvent('download');await templateDialog.getByRole('button',{name:'Baixar gabarito PDF',exact:true}).click();await (await guidePdf).saveAs('/tmp/gabarito-cracha-atleta.pdf');
  assert.equal(fs.readFileSync('/tmp/gabarito-cracha-atleta.pdf').subarray(0,4).toString(),'%PDF');
  const guidePng=page.waitForEvent('download');await templateDialog.getByRole('button',{name:'Baixar imagem-guia PNG',exact:true}).click();await (await guidePng).saveAs('/tmp/gabarito-cracha-atleta.png');
  assert.equal(fs.readFileSync('/tmp/gabarito-cracha-atleta.png').subarray(1,4).toString(),'PNG');
  const blueArt=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=860;c.height=1300;const x=c.getContext('2d');x.fillStyle='#e7efff';x.fillRect(0,0,860,1300);return c.toDataURL('image/png').split(',')[1];});
  nextArtBytes=Buffer.from(blueArt,'base64');
  await templateDialog.getByLabel('Arte do crachá',{exact:true}).setInputFiles({name:'arte-atleta.png',mimeType:'image/png',buffer:nextArtBytes});
  await templateDialog.getByRole('img',{name:'Arte de fundo do modelo',exact:true}).waitFor();
  await templateDialog.getByRole('button',{name:'Verso',exact:true}).click();
  const reverseArt=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=86;c.height=130;const ctx=c.getContext('2d');ctx.fillStyle='#c13744';ctx.fillRect(0,0,86,130);return c.toDataURL('image/png').split(',')[1];});
  persistedBadgeArt.set('verso-atleta.png',Buffer.from(reverseArt,'base64'));
  await templateDialog.getByLabel('Arte do verso',{exact:true}).setInputFiles({name:'verso-atleta.png',mimeType:'image/png',buffer:Buffer.from(reverseArt,'base64')});
  await templateDialog.getByRole('img',{name:'Arte personalizada do verso'}).first().waitFor();
  await templateDialog.getByRole('button',{name:'Frente',exact:true}).click();

  await templateDialog.getByLabel('Campo do crachá',{exact:true}).selectOption('person_name');
  await templateDialog.getByLabel('Esquerda (mm)',{exact:true}).fill('5');
  assert.equal(await templateDialog.getByRole('button',{name:'Remover campo',exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/siep-badge-template-mobile.png',fullPage:true});assert.equal(await templateDialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.setViewportSize({width:1440,height:1000});
  await templateDialog.getByRole('button',{name:'Salvar modelo',exact:true}).click();
  await templateDialog.getByText('Modelo salvo. Será usado nas próximas emissões deste perfil.',{exact:true}).waitFor();
  await templateDialog.getByRole('button',{name:'Fechar configuração do crachá',exact:true}).click();
  await page.getByRole("checkbox",{name:"Selecionar Atleta conectado · Atleta",exact:true}).check();
  const badgePopupPromise=page.waitForEvent('popup');
  await page.getByRole("button",{name:"Emitir e abrir impressão",exact:true}).click();
  const badgePopup=await badgePopupPromise;
  await badgePopup.locator('.badge-credential').waitFor();
  assert.equal(await badgePopup.locator('.event-badge').count(),2);
  await badgePopup.getByLabel('Verso do crachá').waitFor();
  await badgePopup.getByRole('img',{name:'Arte personalizada do verso'}).waitFor();
  const issuedModel=tables.event_badges[0].snapshot.badge_template;
  assert.notEqual(issuedModel.background.id,issuedModel.reverse_background.id);
  await badgePopup.getByText('Atleta conectado',{exact:true}).waitFor();
  await badgePopup.getByText('Escola conectada',{exact:true}).waitFor();
  await badgePopup.getByRole('img',{name:'Arte personalizada do crachá',exact:true}).waitFor();
  await badgePopup.getByText('Futsal',{exact:true}).waitFor();
  await badgePopup.getByText('12 a 14 anos',{exact:true}).waitFor();
  const qrPath=await badgePopup.getByRole('img',{name:'QR Code da emissão'}).locator('path').getAttribute('d');
  assert.ok(qrPath.length>500);
  assert.equal(await badgePopup.locator('.badge-credential').getAttribute('data-template-version'),'1');
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
  await page.getByRole('button',{name:'Configurar arte e campos',exact:true}).click();
  await templateDialog.getByLabel('Campo do crachá',{exact:true}).waitFor();
  await templateDialog.getByLabel('Campo do crachá',{exact:true}).selectOption('person_name');await templateDialog.getByLabel('Esquerda (mm)',{exact:true}).fill('6');
  await templateDialog.getByLabel('Campo do crachá',{exact:true}).selectOption('qr_code');
  await templateDialog.getByRole('button',{name:'Remover campo',exact:true}).click();
  assert.equal(await templateDialog.locator('.badge-qr').count(),0);
  await templateDialog.getByRole('button',{name:'Verso',exact:true}).click();
  await templateDialog.getByRole('button',{name:'Restaurar verso padrão',exact:true}).click();
  await templateDialog.getByRole('img',{name:'Arte personalizada do verso'}).first().waitFor({state:'detached'});

  await templateDialog.getByRole('button',{name:'Salvar modelo',exact:true}).click();await templateDialog.getByText('Modelo salvo. Será usado nas próximas emissões deste perfil.',{exact:true}).waitFor();await templateDialog.getByRole('button',{name:'Fechar configuração do crachá',exact:true}).click();
  const reprintPopupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Reimprimir',exact:true}).click();
  const reprintPopup=await reprintPopupPromise;
  await reprintPopup.locator('.badge-credential').waitFor();assert.equal(await reprintPopup.locator('.badge-credential').getAttribute('data-template-version'),'1');
  assert.equal(await reprintPopup.getByRole('img',{name:'QR Code da emissão'}).locator('path').getAttribute('d'),qrPath);
  await reprintPopup.getByRole('img',{name:'Arte personalizada do verso'}).waitFor();
  await reprintPopup.close();
  assert.equal(tables.event_badges.length,1,'Reimprimir criou nova emissão');
  templateServiceMissing=true;
  await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
  await page.getByRole('button',{name:'Reimprimir',exact:true}).waitFor();
  await page.getByRole('button',{name:'Configurar arte e campos',exact:true}).click();
  await templateDialog.getByText('A gravação de modelos ainda não está disponível neste ambiente. Os gabaritos já podem ser baixados.',{exact:true}).waitFor();
  assert.equal(await templateDialog.getByRole('button',{name:'Salvar modelo',exact:true}).isDisabled(),true);
  assert.equal(await templateDialog.getByRole('button',{name:'Baixar gabarito PDF',exact:true}).isEnabled(),true);
  await templateDialog.getByRole('button',{name:'Fechar configuração do crachá',exact:true}).click();
  templateServiceMissing=false;

  // Profissional distinto: foto própria e aprovação técnica antes do lote misto.
  const printStaff={id:randomUUID(),institution_id:tenant,full_name:'Técnico do crachá de teste',cpf:'12345678909',birth_date:'1990-02-03',gender:'Masculino',archived:false,contact:{},updated_at:new Date().toISOString()};
  tables.people.push(printStaff);
  tables.school_people.push({id:randomUUID(),institution_id:tenant,person_id:printStaff.id,school_id:registration.school_id,role:'staff',position:'Técnico',professional_registration:'123456-G/RR',status:'approved',version:1,archived:false});
  tables.registration_staff.push({id:randomUUID(),institution_id:tenant,event_id:registration.event_id,school_id:registration.school_id,registration_id:registration.id,person_id:printStaff.id,staff_role_id:staffRole.id});
  const printPhoto={id:randomUUID(),institution_id:tenant,person_id:printStaff.id,bucket_id:'siep-development-photos',object_path:'development/print-staff-test.png',original_name:'tecnico.png',status:'uploaded',is_current:true};
  tables.person_photos.push(printPhoto);
  const redImage=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;const context=c.getContext('2d');context.fillStyle='rgb(190,30,30)';context.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];});
  developmentImages.set(printPhoto.object_path,Buffer.from(redImage,'base64'));
  await page.getByLabel('Perfil dos crachás',{exact:true}).selectOption('staff');
  await page.getByText('Nenhum participante aprovado encontrado para estes filtros.',{exact:true}).waitFor();
  await page.goto(origin+'/secretaria/'+tenant+'/inscricoes?tipo=comissao');
  await page.getByRole('button',{name:'Conferir profissional',exact:true}).click();
  const printReview=page.getByRole('dialog',{name:'Conferência do profissional',exact:true});
  await printReview.getByRole('button',{name:'Aprovar profissional',exact:true}).click();
  await printReview.getByLabel('Justificativa da conferência *',{exact:true}).fill('Dados e foto do profissional conferidos para o crachá');
  await printReview.getByRole('button',{name:'Confirmar decisão do profissional',exact:true}).click();
  await printReview.getByText('Aprovado',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar conferência técnica',exact:true}).click();
  isAdmin=false;
  const schoolConferencePath='/escola/'+tenant+'/escolas/'+registration.school_id+'/inscricoes';
  await page.goto(origin+schoolConferencePath+'?'+new URLSearchParams({
    tipo:'comissao',profissional:printStaff.id,evento:registration.event_id,escola:registration.school_id,
  }));
  await printReview.getByText('Aprovado',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Tipo de conferência',{exact:true}).count(),0);
  assert.equal(await printReview.getByRole('button',{name:'Aprovar profissional',exact:true}).count(),0);
  await printReview.getByRole('button',{name:'Fechar conferência técnica',exact:true}).click();
  await page.getByRole('button',{name:'Nova inscrição neste evento',exact:true}).waitFor();
  isAdmin=true;
  await page.goto(origin+'/secretaria/'+tenant+'/inscricoes');

  await page.getByRole('button',{name:'Crachás',exact:true}).click();
  await page.getByLabel('Evento dos crachás',{exact:true}).selectOption(registration.event_id);
  await page.getByLabel('Escola dos crachás',{exact:true}).selectOption(registration.school_id);
  await page.getByRole('checkbox',{name:'Selecionar Atleta conectado · Atleta',exact:true}).check();
  await page.getByRole('checkbox',{name:'Selecionar Técnico do crachá de teste · Comissão técnica',exact:true}).check();
  const mixedPrintPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Emitir e abrir impressão',exact:true}).click();
  const mixedPrint=await mixedPrintPromise;
  await mixedPrint.locator('.event-badge').nth(1).waitFor();
  assert.equal(await mixedPrint.getByRole('img',{name:'Arte personalizada do verso'}).count(),0);
  await mixedPrint.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
  const staffCard=mixedPrint.locator('.event-badge').filter({hasText:'Técnico do crachá de teste'}),athleteCard=mixedPrint.locator('.event-badge').filter({hasText:'Atleta conectado'});
  await staffCard.getByText('CREF 123456-G/RR',{exact:true}).waitFor();
  await staffCard.getByText('Comissão técnica',{exact:true}).waitFor();await athleteCard.getByText('Atleta',{exact:true}).waitFor();
  assert.equal(await mixedPrint.getByText('Escola conectada',{exact:true}).count(),2);
  const samplePixel=async el=>{const c=document.createElement('canvas');c.width=1;c.height=1;const context=c.getContext('2d');context.drawImage(el,0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
  const staffPixel=await staffCard.locator('.badge-portrait').evaluate(samplePixel),athletePixel=await athleteCard.locator('.badge-portrait').evaluate(samplePixel);
  assert.deepEqual(staffPixel.slice(0,3),[190,30,30]);assert.notDeepEqual(staffPixel,athletePixel);
  await mixedPrint.pdf({path:'/tmp/siep-roundtrip-athlete-staff-badges.pdf',preferCSSPageSize:true,printBackground:true});
  await mixedPrint.screenshot({path:'/tmp/siep-roundtrip-athlete-staff-badges.png',fullPage:true});
  await mixedPrint.close();
  assert.equal(tables.event_badges.length,3);
  assert.equal(defaultBadgeTemplates.get('athlete').version,1);
  assert.equal(tables.event_badges.find(b=>b.person_id===printStaff.id).snapshot.badge_template.version_id,defaultBadgeTemplates.get('staff').version_id);
  assert.equal(tables.event_badges.find(b=>b.person_id===printStaff.id).photo_id,printPhoto.id);

  const reportCalls=()=>queryCalls.filter(c=>c.table==='siep_report_page');
  const beforeReports=reportCalls().length;
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await page.getByRole('heading',{name:'Relatórios e filtros',exact:true}).waitFor();
  assert.equal(await page.getByRole('table',{name:'Resultado do relatório'}).count(),0);
  await page.getByLabel('Evento do relatório',{exact:true}).selectOption(tables.events[0].id);
  await page.getByLabel('Escola do relatório',{exact:true}).selectOption(tables.schools[0].id);
  await page.getByLabel('Sexo',{exact:true}).selectOption('Masculino');
  await page.waitForTimeout(500); // Nenhuma consulta automática após o antigo debounce.
  assert.equal(reportCalls().length,beforeReports);
  await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();
  await page.getByText('Nenhum registro encontrado para estes filtros. Ajuste a seleção e gere novamente.',{exact:true}).waitFor();
  assert.equal(reportCalls().length,beforeReports+1);
  await page.getByLabel('Sexo',{exact:true}).selectOption('Feminino');
  await page.getByLabel('Categoria',{exact:true}).selectOption(tables.registrations[0].category_id);
  await page.getByText(/^Personalizar colunas/).click();
  assert.equal(await page.getByRole('checkbox',{name:'Coluna CPF',exact:true}).isChecked(),false);
  await page.waitForTimeout(450);
  assert.equal(reportCalls().length,beforeReports+1);
  const csvDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();
  await (await csvDownload).saveAs('/tmp/siep-relatorio.csv');
  assert.ok(fs.readFileSync('/tmp/siep-relatorio.csv','utf8').includes('Atleta conectado'));
  assert.equal(fs.readFileSync('/tmp/siep-relatorio.csv','utf8').includes('52998224725'),false);
  assert.equal(reportCalls().length,beforeReports+2,'Primeiro lote foi consultado duas vezes');
  assert.equal(reportCalls().at(-1).body.p_limit,500);
  assert.equal(reportCalls().at(-1).body.p_filters.gender,'Feminino');
  assert.equal(await page.locator('.reports-workspace').getByText('Atleta conectado',{exact:true}).count(),0);
  await page.getByLabel('Orientação do PDF',{exact:true}).selectOption('landscape');
  const pdfDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();
  await (await pdfDownload).saveAs('/tmp/siep-relatorio.pdf');
  assert.equal(fs.readFileSync('/tmp/siep-relatorio.pdf').subarray(0,4).toString(),'%PDF');
  const pdfText=require('node:child_process').spawnSync('pdftotext',['/tmp/siep-relatorio.pdf','-'],{encoding:'utf8'});
  if(!pdfText.error){assert.equal(pdfText.status,0);assert.ok(pdfText.stdout.includes('Atleta conectado'));assert.ok(pdfText.stdout.includes('Escola conectada'));}
  await page.getByLabel('Apresentação do relatório',{exact:true}).selectOption('gender');
  const genderDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();
  await (await genderDownload).saveAs('/tmp/siep-relatorio-sexo.csv');
  assert.ok(fs.readFileSync('/tmp/siep-relatorio-sexo.csv','utf8').includes('Feminino'));
  assert.equal(fs.readFileSync('/tmp/siep-relatorio-sexo.csv','utf8').includes('Atleta conectado'),false);
  await page.getByLabel('Apresentação do relatório',{exact:true}).selectOption('school');
  const schoolDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV',exact:true}).click();
  await (await schoolDownload).saveAs('/tmp/siep-relatorio-escola.csv');
  assert.ok(fs.readFileSync('/tmp/siep-relatorio-escola.csv','utf8').includes('Escola conectada'));
  await page.getByLabel('Apresentação do relatório',{exact:true}).selectOption('');
  await page.getByText(/^Personalizar colunas/).click();
  await page.screenshot({path:'/tmp/siep-reports-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/siep-reports-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  const beforeTypes=reportCalls().length;
  for (const type of ['registrations','athletes','staff','staffEntries','responsibles','schools','events'])await page.getByLabel('Tipo de relatório',{exact:true}).selectOption(type);
  await page.waitForTimeout(450);
  assert.equal(reportCalls().length,beforeTypes,'Trocar tipo de relatório consultou participantes');
  if(process.env.SIEP_SCALE_BROWSER)await require('./test_scale_browser.cjs')({page,tables,tenant,queryCalls});
  notificationFailure=true;
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  const notificationPanel=page.getByRole('region',{name:'Avisos recentes',exact:true});
  await notificationPanel.getByRole('alert').waitFor();
  notificationFailure=false;
  await notificationPanel.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await notificationPanel.getByRole('alert').waitFor({state:'detached'});
  await notificationPanel.getByText('Inscrição corrigida e reenviada',{exact:true}).waitFor();
  const unreadBefore=tables.notifications.filter(n=>n.audience==='secretaria'&&!n.read_at).length;
  await notificationPanel.getByRole('button',{name:'Marcar como lida',exact:true}).first().click();
  await notificationPanel.getByText('Lida',{exact:true}).waitFor();
  assert.equal(tables.notifications.filter(n=>n.audience==='secretaria'&&!n.read_at).length,unreadBefore-1);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/siep-notification-bell-mobile.png',fullPage:true});
  assert.equal(await notificationPanel.evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);
  await page.setViewportSize({width:1440,height:1000});
  await notificationPanel.getByRole('button',{name:'Abrir inscrição',exact:true}).first().click();
  await page.getByRole('dialog',{name:'Análise da inscrição',exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar histórico',exact:true}).click();
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
  await page.getByRole("button",{name:"Ver todas as notificações",exact:true}).click();
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
