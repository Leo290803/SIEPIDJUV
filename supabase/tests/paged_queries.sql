-- Fixtures pequenas e reversíveis. Também executadas na validação de migrações.
do $$
declare t uuid:=gen_random_uuid();u uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();s uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();e uuid:=gen_random_uuid();m uuid:=gen_random_uuid();c uuid:=gen_random_uuid();p uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();link uuid:=gen_random_uuid();part uuid:=gen_random_uuid();r uuid:=gen_random_uuid();a uuid:=gen_random_uuid(); result jsonb;snapshot text;k text;denied boolean;
begin
 begin
 insert into auth.users(id) values(u),(outsider);
 insert into public.institutions(id,name,slug) values(t,'Paginação','page-'||t);
 insert into public.institution_memberships(institution_id,user_id,role,status) values(t,u,'manager','approved');
 insert into public.schools(id,institution_id,name,details) values(s,t,'Escola Árvore','{"city":"Boa Vista"}'),(s2,t,'Outra escola','{"city":"Pacaraima"}');
 insert into public.events(id,institution_id,name,edition,status) values(e,t,'Jogos','2026','open');
 insert into public.event_modalities(id,institution_id,event_id,name,classification) values(m,t,e,'Atletismo','individual');
 insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation) values(c,t,e,m,'Sub-14','individual');
 insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) values(p,t,'Ana','2012-02-03','52998224725','Feminino'),(p2,t,'Bruno','2010-01-01','11144477735','Masculino');
 insert into public.school_people(id,institution_id,school_id,person_id,role,status) values(link,t,s,p,'athlete','approved'),(gen_random_uuid(),t,s2,p2,'athlete','approved');
 insert into public.school_people(institution_id,school_id,person_id,role,status,user_id) values(t,s,p2,'responsible','approved',outsider);
 insert into public.event_participations(id,institution_id,event_id,school_id,person_id,status) values(part,t,e,s,p,'complete');
 insert into public.participation_categories(institution_id,event_id,participation_id,category_id) values(t,e,part,c);
 insert into public.registrations(id,institution_id,event_id,school_id,category_id,status,created_at) values(r,t,e,s,c,'approved','2026-11-16T02:00:00Z');
 insert into public.registration_athletes(id,institution_id,event_id,school_id,registration_id,participation_id,person_id,slot_number) values(a,t,e,s,r,part,p,1);
 insert into public.school_event_contexts(institution_id,school_id,event_id,chosen_by) values(t,s,e,u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 foreach k in array array['participants','registrations','athletes','staff','staffEntries','responsibles','schools','events'] loop
  result:=public.siep_report_page(t,jsonb_build_object('type',k));
  if jsonb_typeof(result->'rows')<>'array' then raise exception 'Tipo de relatório inválido: %',k;end if;
 end loop;
 result:=public.siep_report_page(t,jsonb_build_object('type','participants','schoolId',s,'eventId',e,'categoryId',c,'gender','Feminino','from','2026-11-15','to','2026-11-15'));
 if result->>'total'<>'1' or result#>>'{rows,0,cells,name}'<>'Ana' or result#>>'{summary,people}'<>'1' then raise exception 'Filtros ou data local incorretos: %',result;end if;
 result:=public.siep_badge_page(e,null,'athlete');if result->>'total'<>'1' or jsonb_array_length(result->'rows')<>1 then raise exception 'Crachás não paginados';end if;
 result:=public.siep_report_page(t);snapshot:=result->>'snapshot';
 insert into public.school_people(institution_id,school_id,person_id,role,status,position) values(t,s,p2,'staff','approved','Técnico');
 insert into public.event_staff_roles(id,institution_id,event_id,name) values(gen_random_uuid(),t,e,'Técnico');
 insert into public.registration_staff(institution_id,event_id,school_id,registration_id,person_id,staff_role_id) select t,e,s,r,p2,id from public.event_staff_roles where event_id=e;
 result:=public.siep_report_page(t,'{"type":"staffEntries","gender":"Masculino"}');if result->>'total'<>'1' then raise exception 'Sexo da comissão confundido com o dos atletas';end if;
 result:=public.siep_report_page(t,'{"type":"staffEntries","gender":"Feminino"}');if result->>'total'<>'0' then raise exception 'Sexo da comissão ignorado';end if;
 result:=public.siep_report_page(t,'{"type":"participants","gender":"Masculino"}');if result->>'total'<>'0' then raise exception 'Sexo ignorado';end if;
 result:=public.siep_report_page(t,'{"type":"schools","query":"arvore"}');if result->>'total'<>'1' then raise exception 'Acento na pesquisa';end if;
 result:=public.siep_report_page(t,'{"type":"participants"}','gender');if result#>>'{rows,0,cells,people}'<>'1' then raise exception 'Agrupamento incorreto';end if;
 result:=public.siep_report_page(t,'{"type":"athletes"}','','name','asc',1,1);if result->>'total'<>'2' or jsonb_array_length(result->'rows')<>1 then raise exception 'Paginação incorreta';end if;
 result:=public.siep_portal_page(t,'light');if jsonb_array_length(result#>'{tables,people}')<>0 or jsonb_array_length(result#>'{tables,registrations}')<>0 then raise exception 'Tela leve baixou cadastros';end if;
 result:=public.siep_portal_page(t,'people',null,'athlete','{}',0,1);if result->>'total'<>'2' or jsonb_array_length(result#>'{tables,people}')<>1 then raise exception 'Cadastros não paginados';end if;
 result:=public.siep_portal_page(t,'people',null,'athlete','{"status":"all","query":"Bruno"}');if result->>'total'<>'1' then raise exception 'Pesquisa paginada';end if;
 result:=public.siep_portal_page(t,'registrations');if result->>'total'<>'1' or jsonb_array_length(result#>'{tables,registration_athletes}')<>1 then raise exception 'Elenco não carregado';end if;
 result:=public.siep_portal_page(t,'dashboard');if result#>>'{summary,submitted}'<>'0' then raise exception 'Resumo incorreto';end if;
 denied:=false;begin perform public.siep_report_page(t,'{}','','name','asc',0,501);exception when sqlstate '22023' then denied:=true;end;if not denied then raise exception 'Limite ignorado';end if;
 update public.people set full_name='Ana atualizada' where id=p;
 denied:=false;begin perform public.siep_report_page(t,'{}','','name','asc',0,25,snapshot);exception when sqlstate '40001' then denied:=true;end;if not denied then raise exception 'Exportação não detectou alteração';end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;begin perform public.siep_badge_page(e);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Escola acessou crachás da Secretaria';end if;
 denied:=false;begin perform public.siep_report_page(t);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Escola acessou relatório da Secretaria';end if;
 result:=public.siep_portal_page(t,'people',s,'athlete','{"status":"all"}');if result->>'total'<>'1' or jsonb_array_length(result#>'{tables,event_participations}')<>1 or result#>>'{tables,people,0,full_name}'<>'Ana atualizada' then raise exception 'Escopo da escola incorreto';end if;
 denied:=false;begin perform public.siep_portal_page(t,'people',s2,'athlete');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Outra escola exposta';end if;
 denied:=false;begin perform public.siep_portal_page(t,'people',null,'athlete');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Escola acessou toda a instituição';end if;
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;begin perform public.siep_report_page(t);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anônimo acessou relatório';end if;
 if has_function_privilege('anon','public.siep_report_page(uuid,jsonb,text,text,text,integer,integer,text)','execute') or has_function_privilege('anon','public.siep_portal_page(uuid,text,uuid,text,jsonb,integer,integer,uuid,boolean)','execute') or has_function_privilege('authenticated','siep_private.report_rows(uuid,jsonb)','execute') then raise exception 'Privilégios indevidos';end if;
 raise exception 'rollback_paged_queries' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
end $$;
