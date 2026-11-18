-- Conclusão da escola: salva o elenco e envia validado na mesma transação.
create table siep_private.registration_completion_requests (
 actor_user_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(actor_user_id,request_id)
);
revoke all on siep_private.registration_completion_requests from public,anon,authenticated;
create function public.siep_complete_registration(p_request_id uuid,p_event_id uuid,p_school_id uuid,p_category_id uuid,p_proof_id uuid,p_athletes jsonb,p_staff jsonb,p_registration_id uuid default null,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare tenant uuid;payload jsonb;previous siep_private.registration_completion_requests;saved jsonb;sent jsonb;current_status text;message text;
begin
 select institution_id into tenant from public.events where id=p_event_id;
 if tenant is null then raise exception 'Evento indisponível' using errcode='P0002';end if;
 perform siep_private.require_school(tenant,p_school_id);
 if auth.uid() is null or p_request_id is null then raise exception 'Operação inválida' using errcode='22023';end if;
 payload:=jsonb_build_object('event',p_event_id,'school',p_school_id,'category',p_category_id,'proof',p_proof_id,'athletes',p_athletes,'staff',p_staff,'registration',p_registration_id,'revision',p_expected_revision);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id,0));
 select * into previous from siep_private.registration_completion_requests where actor_user_id=auth.uid() and request_id=p_request_id;
 if found then
  if previous.payload<>payload then raise exception 'Identificador de operação já utilizado; tente novamente' using errcode='22023';end if;
  return previous.result;
 end if;
 saved:=public.siep_save_registration(p_event_id,p_school_id,p_category_id,p_proof_id,p_athletes,p_staff,p_registration_id,p_expected_revision);
 select status into current_status from public.registrations where id=(saved->>'id')::uuid;
 saved:=saved||jsonb_build_object('saved',true,'submitted',false,'status',current_status);
 if saved->'issues'='[]'::jsonb then
  begin
   sent:=public.siep_transition_registration((saved->>'id')::uuid,(saved->>'revision')::integer,'submitted',case when current_status='correction_requested' then 'Correções salvas e inscrição reenviada pela escola' else 'Inscrição concluída pela escola' end);
   saved:=saved||sent||jsonb_build_object('submitted',true);
  exception when check_violation then
   -- Ex.: evento fechado/prazo encerrado. Preserva o rascunho salvo, sem
   -- converter falha de envio em sucesso nem contornar a regra existente.
   get stacked diagnostics message=message_text;
   saved:=saved||jsonb_build_object('submission_error',message);
  end;
 end if;
 insert into siep_private.registration_completion_requests(actor_user_id,request_id,payload,result) values(auth.uid(),p_request_id,payload,saved);
 return saved;
end $$;
revoke all on function public.siep_complete_registration(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,integer) from public,anon;
grant execute on function public.siep_complete_registration(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,integer) to authenticated;
notify pgrst,'reload schema';
