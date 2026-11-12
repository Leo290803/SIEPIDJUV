# Contratos de acesso do SIEP

> **Atualização:** a senha gerada permite entrada direta, sem troca obrigatória no primeiro acesso. Migração `20261112180000_remove_required_initial_password_change`: 17 migrações. Senhas existentes preservadas.

> Atualização de acesso: portais separados em `/secretaria/entrar` e `/escola/entrar`, com rotas e permissões documentadas em [ROTAS.md](../ROTAS.md). A migração `20261112150000_portal_access_and_staff_accounts` acrescenta `siep_my_access`, `siep_staff_accounts` e `siep_set_staff_account`. Os dois últimos exigem administrador; a primeira retorna somente os vínculos aprovados da própria conta. São 14 migrações e sete suítes SQL.

O portal conectado já consome os contratos de cadastro, arquivos, inscrições e análise descritos aqui. Chamadas do portal usam uma sessão real de Supabase Auth. Não usar o token administrativo do ambiente no cliente. Usuário sem vínculo aprovado pode somente solicitar/acompanhá-lo e consultar o diretório mínimo de escolas.

## Leitura e configuração

SELECT das tabelas públicas passa por RLS: secretaria da instituição ou responsável aprovado da escola. Contas sem esse vínculo não recebem pessoas, documentos nem inscrições. Metadados de solicitação ficam em `school_link_requests`, visíveis apenas ao solicitante e à secretaria.

Secretaria pode inserir/editar escolas e configurações de eventos diretamente pela API com sua conta, nas colunas autorizadas. Gestão de papéis administrativos é exclusiva de admin. Exclusão física não é concedida ao portal; usar arquivamento/ativação quando disponível. Configurações são versionadas e auditadas. Alterações podem tornar rascunhos/cadastros anteriores pendentes; envio/aprovação reavaliam o estado atual.

O primeiro cliente e seu primeiro vínculo administrativo são criados administrativamente, associados a uma conta existente em `auth.users`. Não há RPC pública de autoprovisionamento de admin. Não foram criados usuários ou clientes reais nesta entrega.

## Pessoas e vínculos

| RPC | Parâmetros e resultado |
| --- | --- |
| `siep_school_directory` | `p_institution_slug` → escolas ativas, somente `id,name,inep`; requer conta autenticada |
| `siep_request_school_link` | `p_school_id,p_data` → UUID do vínculo pendente; os quatro dados fixos são exigidos mesmo se CPF já existir |
| `siep_decide_school_link` | `p_link_id,p_status,p_reason` → sem retorno; secretaria decide e registra justificativa |
| `siep_save_person` | `p_institution_id,p_school_id,p_role,p_data,p_person_id=null` → UUID da pessoa |
| `siep_link_person` | `p_institution_id,p_school_id,p_person_id,p_role` → UUID do vínculo atleta/profissional, reutilizando identidade já autorizada |
| `siep_request_transfer` | `p_institution_id,p_person_id,p_source_school_id,p_target_school_id,p_reason` → UUID da solicitação |
| `siep_decide_transfer` | `p_transfer_id,p_status,p_reason` → sem retorno; apenas secretaria, `approved` ou `refused` |

`p_data` usa `full_name`, `birth_date` (`YYYY-MM-DD`), `cpf`, `gender` (`Masculino`/`Feminino`) e `contact` (objeto opcional). No cadastro/edição da pessoa, `archived` pode ser informado. Para profissional, informar também `position` e, opcionalmente, `professional_registration`; a função registrada na escola precisa corresponder à função habilitada escolhida na inscrição. O payload de edição substitui os campos pessoais/contatos informados; enviar o formulário completo. CPF com pontuação é normalizado antes de gravar. Data válida, CPF com dígitos verificadores e nome não vazio são obrigatórios. O papel não é um privilégio de conta: criar atleta/profissional não cria usuário administrativo.

Novo responsável criado pela secretaria permanece pendente; seu autocadastro pode associar a conta àquele registro pendente. A solicitação preserva os dados declarados separadamente da identidade existente, para revisão. Conhecer CPF não permite consultar dados nem receber aprovação automática. Aprovar requer conta associada. Justificativa é obrigatória; reabrir vínculo encerrado/recusado volta para pendente.

Editar identidade usada por outra escola ou por outro responsável exige secretaria. Identidade em inscrição enviada/aprovada exige correção antes de mudar. Uma pessoa pode ser atleta e profissional sem duplicação. Novo vínculo de atleta em outra escola exige transferência analisada.

## Cadastro na edição

`siep_save_participation(p_event_id,p_school_id,p_person_id,p_category_ids,p_additional_data,p_complete=false)`

- `p_category_ids` é uma lista de UUIDs da edição; `p_additional_data` é objeto JSON dos dados adicionais.
- Retorna `{id,status,issues}`. `issues` contém códigos de pendências da configuração vigente.
- Em rascunho, salva pendências de categorias/documentos. Os quatro dados pessoais pertencem à pessoa e já precisam ser válidos.
- `p_complete=true` exige cadastro sem pendências. Não cria inscrição, não envia para análise nem seleciona vaga.
- Não muda a escola de uma participação preexistente. Não edita cadastro em inscrição enviada/aprovada.

`siep_archive_participation(p_participation_id,p_archived)` preserva pessoa/documentos e exige resolver inscrições ativas antes de arquivar. Reativação volta a rascunho para revisão.

`siep_set_active_event(p_school_id,p_event_id)` grava o contexto por escola. SELECT de `school_event_contexts` devolve o contexto autorizado. Escola e edição precisam ser da mesma instituição.

## Documentos

1. `siep_prepare_document(p_participation_id,p_requirement_id,p_name,p_mime_type,p_size_bytes)` → `{id,bucket,path}`.
2. Upload para o caminho exato no bucket privado, pela API de Storage com a mesma sessão autorizada. Sem `upsert`.
3. `siep_finalize_document(p_document_id)` verifica objeto, MIME, tamanho e exigência.
4. Revalidar/concluir o cadastro pelo RPC de participação.

Preparar documento novo substitui a referência corrente por uma nova versão pendente e devolve o cadastro a rascunho. A versão/arquivo anterior permanece preservada. Se o upload falhar, preparar outra versão antes de tentar um caminho novo. Extensão/caminho são gerados pelo servidor. Não informar caminho arbitrário nem gravar base64 em pessoa/participação. Documentos de inscrição enviada/aprovada exigem correção antes de substituição.

A migração/testes não enviaram arquivos reais. Testes SQL de metadados não equivalem a um teste HTTP completo do Storage nem a inspeção do conteúdo binário.

## Inscrições e vagas

`siep_save_registration(p_event_id,p_school_id,p_category_id,p_proof_id,p_athletes,p_staff,p_registration_id=null,p_expected_revision=null)`

```json
{
  "p_athletes": [
    {"participation_id": "UUID do cadastro na edição", "slot_number": 1}
  ],
  "p_staff": [
    {"person_id": "UUID da pessoa", "staff_role_id": "UUID da função na edição"}
  ]
}
```

Retorna `{id,revision,status,issues}`. A escola representa a inscrição automaticamente; não recebe nome manual de equipe. Uma inscrição usa uma categoria e, quando configurada, uma prova. Participação e profissionais precisam ser do contexto autorizado. `p_proof_id` pode ser null apenas para categoria sem provas na inscrição final.

Nova inscrição começa em `draft`, revisão 1. Edição exige ID e revisão atual, substitui o elenco/comissão atomicamente e incrementa a revisão. Só rascunho ou correção é editável. Categoria/prova são imutáveis na inscrição; cancelar e criar outra quando for necessário mudar o destino.

Pendências esportivas podem ser salvas em rascunho. Estrutura inválida, participação de outra escola/edição, vaga fora de N, posição duplicada e atleta repetido na prova são recusados imediatamente. Cada seleção tem uma posição positiva por escola/prova; selecionar ainda não aprova a inscrição. Vagas liberadas por cancelamento/indeferimento podem ser selecionadas novamente, sem apagar a versão antiga.

### Consultas de apoio

| RPC | Resultado |
| --- | --- |
| `siep_eligible_athletes(p_event_id,p_school_id,p_category_id,p_proof_id=null,p_registration_id=null)` | Pessoas/cadastros elegíveis da escola, sem CPF/contatos; aplica nascimento, sexo, documentos, categoria, vínculo e regras por atleta |
| `siep_preview_registration(...)` | Mesmos parâmetros de salvar, devolve `{issues}` e desfaz todas as alterações internas; não reserva vaga |
| `siep_registration_issues(p_registration_id)` | Pendências atuais do conjunto salvo |
| `siep_registration_receipt(p_registration_id,p_revision=null)` | Snapshot preservado de uma revisão autorizada; inclui dados pessoais e exige o mesmo acesso da inscrição |

A prévia do conjunto verifica mínimos do elenco/comissão e demais regras; a consulta de elegíveis verifica regras por atleta. Não presumir que uma consulta anterior reserva vaga ou garante o envio: outra transação pode gravar antes, e o servidor revalida ao salvar/enviar.

### Situações e decisões

`siep_transition_registration(p_registration_id,p_expected_revision,p_status,p_reason,p_correction_deadline=null)` → `{id,revision,status}`.

| Origem | Destino | Quem/condições |
| --- | --- | --- |
| `draft` | `submitted` | Escola/secretaria, evento aberto, prazo de inscrição e validações atuais |
| `submitted` | `approved`, `rejected` | Secretaria, com justificativa; aprovação revalida |
| `submitted` | `correction_requested` | Secretaria, com justificativa e prazo futuro obrigatório |
| `correction_requested` | `submitted` | Escola/secretaria, dentro do prazo de correção e sem pendências |
| `draft`, `submitted`, `correction_requested` | `cancelled` | Escola/secretaria, com justificativa |
| `approved` | `cancelled` | Somente secretaria, com justificativa |

Não há reabertura silenciosa de inscrição recusada/cancelada. Cada gravação/decisão incrementa a revisão e preserva snapshot imutável. Envio grava data; decisões preservam origem/destino, autor e prazo. Notificações de situação são persistidas para responsáveis aprovados da escola. A decisão e sua notificação são parte da mesma transação.

## Duplicação de evento

`siep_duplicate_event(p_source_event_id,p_name,p_edition,p_registration_start=null,p_registration_end=null)` → UUID do novo evento, somente secretaria.

Copia configuração com novos IDs e remapeamento de referências. Não copia pessoas, inscrições, participações, arquivos ou datas antigas de inscrição/correção. Começa em rascunho. Anos de nascimento e datas de referência são preservados e precisam ser revisados na nova edição.

## Notificações e serviço interno

`siep_mark_notification_read(p_notification_id)` marca somente notificação da própria conta ainda vinculada à instituição.

O worker externo usa acesso de serviço, nunca a sessão de escola:

- `siep_private.claim_notifications(batch_size=20)` reserva até 100 itens com `FOR UPDATE SKIP LOCKED`, token e lease de cinco minutos.
- `siep_private.finish_notification(outbox_id,token,error_message=null)` conclui somente a reserva com aquele token; erro agenda nova tentativa, no máximo dez reservas.
- A outbox referencia `notifications`, que contém destinatário e payload. O worker resolve a conta/destino e integra o provedor de e-mail fora do banco.

Essas funções privadas não são endpoints públicos do PostgREST e não são executáveis por `authenticated`/`anon`. A entrega externa é pelo menos uma vez: o worker deve usar ID/deduplicação da notificação no provedor, porque uma falha após enviar e antes de confirmar pode ocasionar nova tentativa. Nenhum serviço de e-mail foi instalado ou acionado.

## Erros e concorrência

| SQLSTATE | Tratamento esperado |
| --- | --- |
| `42501` | Acesso negado; não tentar trocar instituição/escola no cliente |
| `40001` | Revisão/reserva desatualizada; recarregar estado, não repetir sobrescrevendo automaticamente |
| `23505` | Duplicidade, inclusive vaga/atleta; atualizar as opções disponíveis |
| `23503` | Referência fora do contexto ou inexistente |
| `23514` | Regra/fluxo inválido; em envio/conclusão, `detail` contém os códigos das pendências |
| `P0002` | Registro indisponível |

Campos ausentes, datas/tipos inválidos também podem gerar os códigos padrão de conversão/not-null do PostgreSQL. Toda falha desfaz a operação; não salvar parcialmente no cliente como se o servidor tivesse aceitado. Erros de rede com resultado de commit desconhecido exigem consultar a revisão atual antes de reenviar.

## Configuração conectada e primeiro administrador

`siep_save_event_configuration(p_event_id,p_expected_version,p_section,p_payload)` salva `sports`, `rules`, `requirements` ou `functions` em transação, após autorizar a secretaria e conferir a versão atual. Retorna a nova versão. A camada `sectionPayload` em `src/data/eventMapping.js` define os arrays normalizados: modalidades/categorias/provas, regras, campos/documentos ou funções. Não aceita substituir registros de outro evento pelo ID. Registros de configuração ausentes são desativados/ocultados, preservando referências históricas; regras removidas são excluídas após confirmação no editor. Exigências desativadas não são solicitadas em novos cadastros e conservam os documentos antigos.

`python scripts/provision_institution.py --project-ref oshzcmmbhxvmchjgxztp --email 'titular@exemplo.com'` prepara um cliente/admin. O script é administrativo, não é endpoint do portal. Reserva o endereço em `siep_private.bootstrap_administrators`, sem senha ou envio de mensagem; se já houver conta confirmada, ativa o vínculo. Caso contrário, um trigger do Auth só o ativa após `email_confirmed_at` ser preenchido para o endereço exato reservado. Reserva diferente ou admin preexistente são recusados para impedir substituição acidental.

A autenticação real usa e-mail/senha e PKCE; recuperação volta à raiz com `?recovery=1`. A chave versionada em `publicConfig.js` é somente `anon`, com RLS; o token administrativo permanece no ambiente. Testes de navegador simulam HTTP do provedor e não substituem verificação real do e-mail.

## Portal completo: gravação composta e documentos

`siep_save_connected_person(p_institution_id,p_school_id,p_role,p_data,p_link_id=null,p_create_id=null,p_expected_version=null,p_event_id=null,p_category_ids=null,p_additional_data={},p_expected_person_updated_at=null)` retorna `{person_id,link_id,version,participation}`. Papéis: `athlete`, `staff`, `responsible` (este exige secretaria). `p_data` tem os campos do cadastro de pessoa e do perfil; `archived` é do papel naquela escola, não da identidade global. IDs da pessoa e do vínculo são diferentes.

- Novo cadastro pode enviar UUID estável em `p_create_id`. CPF já existente só é reutilizado se a identidade for autorizada e os dados fixos coincidirem. Não se expõe a identidade de outra escola por CPF.
- Edição usa `p_link_id` e `p_expected_version`; alteração dos dados reutilizáveis também usa `p_expected_person_updated_at`. O vínculo não pode mudar de escola por esse formulário.
- `p_event_id` opcional cria/atualiza a participação **em rascunho**, dentro da mesma transação. Campos adicionais da edição não sobrescrevem o contato reutilizável. Completar usa `siep_save_participation` após os arquivos serem finalizados.
- Perfil arquivado/encerrado não entra em novas inscrições. Arquivar um atleta não arquiva seu papel profissional. Inscrições enviadas/aprovadas exigem correção antes de alterar identidade ou arquivar integrantes.

`siep_remove_document(p_document_id)` autoriza pela participação/escola, impede mudança em cadastro enviado/aprovado, marca a versão como superseded e devolve a participação a rascunho. Não apaga objeto/arquivo.

O cliente conectado faz: gravação composta → remoções lógicas → preparar/enviar/finalizar arquivos → concluir participação, quando solicitado. Uma falha de arquivo é reportada como rascunho preservado para revisão, sem sucesso falso. RLS permanece obrigatória em todas as leituras e no Storage.

## Solicitação simplificada de acesso escolar

`siep_school_directory(p_institution_slug)` retorna as escolas ativas para escolha explícita. `siep_request_school_access(p_school_id uuid, p_full_name text)` exige sessão/e-mail confirmado, valida a escola e cria responsável com vínculo pendente. Não recebe papel/situação do cliente e não libera acesso. A Secretaria aprova pelo contrato `siep_decide_school_link` existente. Duplicatas por conta/escola são recusadas e o pedido não mescla identidades pelo nome.

CPF, nascimento e sexo podem estar todos ausentes na identidade inicial do responsável; preenchimento parcial é recusado. Pessoas com vínculo de atleta/profissional ou participação exigem identidade completa, inclusive contra alterações diretas. A RPC antiga com quatro dados permanece compatível. Não são gravados dados civis fictícios.

O portal do IDJUV usa o código `idjuv` automaticamente. Outras instituições podem compartilhar `/acesso-pendente?instituicao=SEU-CODIGO` com contas conectadas; o código apenas consulta o diretório e nunca concede permissão.

## Acesso gerenciado pela Secretaria (substitui solicitação aberta)

`disable_signup=true` no Auth. `siep_request_school_access`, `siep_request_school_link` e `siep_school_directory` não podem mais ser executadas por anon/authenticated. Permanecem para preservar contratos históricos e fixtures administrativas.

- Edge `provision-school-access`: corpo `{link_id}`; exige JWT real, consulta `siep_school_access_context` com a sessão e cria conta com Auth Admin **sem enviar e-mail**. A senha inicial segue a decisão do usuário: ano de nascimento + quatro últimos dígitos do CPF. A autorização final usa `siep_authorize_school_account`, exclusiva do backend e revalida funcionário/escola/pessoa. Resposta de criação inclui usuário/senha inicial; conta existente mantém senha. Resposta tem `Cache-Control: no-store`.
- Edge `cpf-login`: corpo `{cpf,password}`; normaliza CPF como string, usa `siep_cpf_login_account` exclusivamente via backend, limita tentativas e autentica a senha no Auth. Retorna apenas access_token/refresh_token. E-mail interno nunca é resposta pública do endpoint.
- `siep_password_change_required()`: própria conta. `siep_initial_password` fica em `raw_app_meta_data`, não em metadado editável pelo usuário. Troca do hash no Auth remove a marca. `is_staff`/`can_school` negam os dados antes da troca.

As funções usam `SUPABASE_SERVICE_ROLE_KEY` somente no servidor. `verify_jwt=false` no gateway permite CPF sem sessão; o endpoint de provisionamento valida o JWT com `/auth/v1/user` e revalida a permissão no banco. As funções têm origens CORS explícitas e não registram credenciais. Deployment: `scripts/deploy_school_access.py`.
