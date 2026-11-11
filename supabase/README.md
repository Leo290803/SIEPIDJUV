# Banco SIEP

Projeto verificado: `siep` (`oshzcmmbhxvmchjgxztp`). Primeira migração aplicada em 11/11/2026. O banco estava sem tabelas de aplicação, políticas ou buckets antes desta entrega; os schemas gerenciados pelo Supabase foram preservados.

## Operação

Usa Python 3 (biblioteca padrão) e a credencial segura `SUPABASE_ACCESS_TOKEN` já disponível no ambiente, restrita a `api.supabase.com`. Nenhum token pertence ao frontend.

```sh
# Valida todas as migrações pendentes e os testes; desfaz a transação.
python scripts/supabase_migrate.py --project-ref oshzcmmbhxvmchjgxztp
# Aplica as pendentes e os testes em uma única transação.
python scripts/supabase_migrate.py --project-ref oshzcmmbhxvmchjgxztp --apply
```

Histórico em `siep_migrations.applied`, com versão, SHA-256 e data. Migrações aplicadas são imutáveis; mudanças exigem novo arquivo. Esse histórico é próprio deste executor, não é o histórico do Supabase CLI. Não executar os mesmos arquivos diretamente pelo CLI sem antes reconciliar os históricos. O runner utiliza trava transacional, falha diante de conflitos e não faz reset nem reconciliação destrutiva. Em falha/timeout, consultar novamente o histórico antes de repetir: não presumir sucesso nem falha de commit remoto.

Os testes SQL criam fixtures em subtransação e sempre as desfazem, mesmo durante aplicação. Uma segunda execução confirmou que não havia migrações pendentes. A validação com rollback no projeto remoto foi escolhida porque ainda não há dados da aplicação; futuras alterações com dados reais devem passar primeiro por um projeto de teste.

## Modelo entregue

- `institutions`, `institution_memberships`: clientes, marca e vínculos administrativos com `auth.users`.
- `schools`: escolas e futuras entidades participantes; INEP opcional e único por cliente.
- `people`: identidade reutilizável, CPF válido/normalizado único por instituição, nascimento e sexo obrigatórios.
- `school_people`, `membership_decisions`: papéis de atleta, responsável e profissional, vínculos pendentes/aprovados e decisões com justificativa.
- `events`, `event_modalities`, `event_categories`, `event_proofs`: edições, classificação da modalidade, participação, anos inclusivos e capacidade por prova/escola separada do mínimo de integrantes.
- `event_rules`, `event_fields`, `document_requirements`, `event_staff_roles`: configuração da edição; referências de regra limitadas ao evento/categoria/prova correto. Parâmetros JSON ainda não executam regras esportivas no servidor.
- `event_participations`, `participation_categories`: pessoa por edição e escola, categorias pretendidas, dados adicionais e estado do cadastro.
- `participant_documents`: metadados por participação/exigência, caminho por instituição/edição, MIME e tamanho. Bucket `siep-documents` privado, PDF/PNG/JPEG, 5 MB. Não foram enviados arquivos.
- `legacy_id_mappings`: reserva de mapeamento por cliente/origem/tipo para IDs legados; não importa dados e não substitui a validação de referências da futura importação.

Chaves estrangeiras compostas impõem consistência de instituição e edição. Nenhuma cascata destrutiva. CPF de clientes diferentes pode coincidir. A base nova exige identidade completa; registros legados incompletos continuam no navegador e precisarão de revisão na importação, sem apagamento.

## Acesso e limites

RLS habilitada nas 18 tabelas; permissões de `anon` e `authenticated` revogadas, sem políticas permissivas. Schemas privados e histórico também não são acessíveis a esses papéis. Acesso administrativo permanece disponível. Não há autenticação, autorização por usuário nem integração das telas nesta entrega. Ao criar as políticas, revisar também a execução da função privada de CPF para as escritas autorizadas.

Não foram criadas instituições, contas ou pessoas reais. Não houve alteração em localStorage/IndexedDB, importação automática, publicação do ambiente ou mudança nas telas.

## Próximas migrações

1. Inscrições por escola/categoria/prova, integrantes/comissão, vagas numeradas, exclusão mútua e histórico de versões/decisões; validar concorrência real antes de liberar envio.
2. Validadores no servidor para os oito tipos de regra, elegibilidade por nascimento/sexo, requisitos e transições de cadastro/inscrição. O status `complete` ainda é armazenamento administrativo, não comprova essa validação.
3. Políticas RLS por conta/instituição/escola e decisões aprovadas; Storage com políticas vinculadas aos metadados e verificação de objeto/exigência/MIME. Não há upload autorizado pelo portal ainda.
4. Camada de repositórios e integração inicial de instituições/escolas/eventos, mantendo demonstração local até autenticação segura.
5. Exportação/importação explícita dos navegadores com mapeamento dos IDs e tratamento de registros incompletos.

## Validação desta entrega

Testes SQL de CPF, unicidade por cliente, chaves entre instituições, faixa incompleta, RLS, permissões e bucket passaram na validação e na aplicação. Verificação posterior: 18 tabelas protegidas, uma migração registrada e zero instituições/pessoas/escolas. Os 46 testes existentes e `npm run build` passaram.
