-- Decisão do usuário: manter a senha gerada, sem exigir troca no primeiro acesso.
-- Compatibilidade com clientes antigos: a consulta continua existindo e retorna false.
create or replace function siep_private.password_change_required() returns boolean
language sql stable security definer set search_path=pg_catalog as $$ select false; $$;
drop trigger clear_siep_initial_password on auth.users;
-- Somente remove a marca de controle; nenhum hash/senha é alterado.
update auth.users set raw_app_meta_data=raw_app_meta_data-'siep_initial_password'
where raw_app_meta_data ? 'siep_initial_password';
notify pgrst,'reload schema';
