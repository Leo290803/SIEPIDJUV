# Continuidade do SIEP — contexto para o próximo chat

Atualizado em 12/11/2026. Este documento consolida as decisões do usuário e o estado real do código. Não contém credenciais. Leia também README.md e inspecione o checkout antes de começar.

## Integração atual — acesso e primeiras telas conectadas

O usuário autorizou conectar o login e iniciar a integração de instituições, escolas e eventos. Esta atualização substitui as afirmações históricas de que nenhuma tela usa o banco.

- `main.jsx` abre `AccountGate`: login/criação/recuperação com Supabase Auth, chave pública e PKCE. A demonstração anterior está em `DemoApp.jsx`, carregada sob escolha explícita. Nenhuma chave administrativa foi embutida no site.
- `ConnectedApp.jsx` e `src/data/` conectam instituições, escolas (criar/editar/arquivar), eventos (criar/editar/situação/datas), quatro seções de configuração e duplicação. Vínculos de responsáveis podem ser solicitados e analisados com justificativa. Permissões vêm do banco, não de seletor visual.
- Configuração é salva atomicamente por seção com versão esperada; falha mantém o formulário aberto. Campos, referências, arquivos e dados de outras seções são preservados. Escolas e metadados do evento também rejeitam atualizações desatualizadas.
- IDJUV provisionado; o e-mail informado pelo usuário foi reservado **em tabela privada**, sem senha e sem envio de mensagem pelo agente. O titular usa Criar conta e confirma o endereço; só a confirmação do Auth ativa a primeira associação de admin. Não criar senha padrão nem pedir token novo.
- Auth usa `https://siepidjuv.vercel.app` como URL oficial, com callbacks explícitos de confirmação/recuperação e localhost:5173 para desenvolvimento. Confirmação de e-mail foi preservada. Entrega de e-mail real não foi validada.
- **Onze migrações aplicadas**, sem pendências: às oito anteriores somam-se `20261112130000_connected_event_configuration`, `20261112131000_first_administrator` e `20261112132000_duplicate_disabled_documents`. Não editar arquivos já aplicados.
- O domínio da API administrativa já é permitido; o domínio `oshzcmmbhxvmchjgxztp.supabase.co` teve conexão negada (proxy 403) no executor. Sua inclusão foi salva em rascunho de rede, com `requires_publish=true`. O agente não publicou o ambiente. Para ativar essa mudança, o usuário revisa/salva o rascunho nas configurações e publica o ambiente; isso não exige outro token e não impede continuar testes independentes.
- 50 testes JS, build, cinco suítes SQL e três cenários concorrentes passaram. Navegador Chromium foi testado com API simulada: login/recuperação, escolas/eventos/configuração, falhas, recarga, logout, leitura escolar e mobile. Não tratar API simulada como prova de login real ou e-mail entregue.
- **Preservação:** nenhuma importação automática dos navegadores, nenhum dado local apagado. Portal conectado nunca cai silenciosamente para armazenamento local. Modo demonstração mantém os fluxos antigos identificados como locais.
- Próxima integração: pessoas/participações, upload real e inscrições consumindo os contratos do banco já existente. CPF como identificador de login continua evolução futura; o login desta entrega é por e-mail verificado.
- Arquivos operacionais: `scripts/provision_institution.py` reserva o primeiro admin de uma instituição sem criar senha/enviar e-mail. Não usar isso para substituir administradores existentes. Testes e comandos estão no README.

## Estado atual do banco — prioridade desta continuação

O usuário pediu concentrar a estruturação no banco antes de continuar as telas. Esta seção substitui o estado de implementação dos itens antigos abaixo, que preservam as decisões do produto. Não repetir o planejamento nem recriar a base.

- Projeto autorizado `siep` (`oshzcmmbhxvmchjgxztp`), acesso administrativo confirmado com a credencial segura existente. Não pedir outro token.
- **Oito migrações aplicadas e verificadas:** `20261111233000_siep_foundation` e os sete incrementos `20261112000100` até `20261112000700`. Arquivos em `supabase/migrations`; não editar os aplicados.
- **29 tabelas públicas com RLS**: instituições, escolas, pessoas reutilizáveis, papéis/vínculos, configuração completa por edição, participações/documentos, inscrições por categoria/prova, vagas numeradas, comissão, versões/decisões, auditoria, transferências, notificações, contexto de evento ativo e mapeamento de IDs legados.
- RPCs e políticas autorizam secretaria e responsáveis aprovados. Vínculo pendente não libera acesso; anon não lê dados nem executa as funções do SIEP. Primeiro cliente/admin ainda precisa ser provisionado administrativamente após existir uma conta real no Auth.
- As oito regras, sexo/nascimento, exigências, comissão e capacidade são reavaliados no servidor ao enviar/aprovar. Rascunhos podem guardar pendências esportivas. Concluir cadastro não cria inscrição. Vagas/atletas duplicados têm índices únicos; profissional de outra escola é recusado já no rascunho para não expor identidade em snapshots; revisões e travas protegem concorrência.
- Fluxo de envio, devolução com prazo, reenvio, aprovação/indeferimento e cancelamento com justificativa está implementado no banco. Snapshots preservam identidade, escola, documentos e configuração da revisão.
- Storage privado tem preparação, autorização de upload e finalização por objeto/MIME/tamanho, com versões imutáveis por caminho. Não houve envio de bytes de arquivos; os testes SQL de metadados foram desfeitos.
- Duplicação remapeia IDs sem copiar pessoas/inscrições/arquivos. Transferência exige análise e preserva edições anteriores. Fila de notificações está preparada; nenhum e-mail foi enviado e um worker externo ainda precisa ser integrado.
- Quatro suítes SQL passaram no PostgreSQL 17 descartável e no Supabase real (validação com rollback, aplicação e reexecução sem pendências). Três testes com conexões simultâneas passaram: mesma vaga, mesmo atleta em vagas diferentes e mesma revisão de edição.
- As tabelas anteriores, os schemas gerenciados e a configuração do bucket foram preservados. Fixtures são revertidas; nenhum usuário, instituição, pessoa ou inscrição real foi cadastrado nesta entrega.
- **Nenhuma tela foi conectada ao banco ainda.** localStorage/IndexedDB continuam nos navegadores. Login/recuperação, upload real, consumidor de e-mail, integração das telas e exportação/importação dos dados locais são integrações pendentes, não motivos para redesenhar as entidades principais. Competições e inscrições públicas seguem adiadas.
- Modelo, operação e limites em [supabase/README.md](supabase/README.md); assinaturas, payloads, permissões e erros em [supabase/API.md](supabase/API.md).
- Validação/aplicação: `python scripts/supabase_migrate.py --project-ref oshzcmmbhxvmchjgxztp` (rollback) ou com `--apply`. Testes locais, incluindo concorrência: `python scripts/test_database.py`. `supabase/local/bootstrap.sql` é exclusivo do container descartável e nunca deve ser executado no Supabase.
- Histórico SHA-256 em `siep_migrations.applied` é próprio do executor, separado do Supabase CLI. O runner recusa checksums divergentes/checkout atrasado e serializa aplicações. Não resetar, sobrescrever ou reaplicar rascunhos anteriores.

## 1. Objetivo atual e autorização

O usuário quer começar a estruturar o banco de dados agora, antes de ampliar a aplicação. Criou um projeto Supabase e quer que o agente tenha acesso direto para criar as tabelas e configurações necessárias, com migrações versionadas no GitHub.

O chat anterior não recebeu a credencial no executor antigo. O usuário informou que outro chat, de configuração do ambiente, já tem acesso. Esse acesso precisa ser verificado no chat de destino; não foi validado por este checkout. Não trate uma captura de tela, um token declarado no rascunho ou a publicação do ambiente como prova de acesso ao banco.

A próxima ação é verificar o acesso administrativo sem alterar dados, inspecionar o esquema existente e preparar a primeira migração do SIEP. Não recomeçar o produto nem redesenhar novamente as telas.

## 2. Repositório, execução e publicação

- Repositório atual: https://github.com/Leo290803/SIEPIDJUV
- O nome antigo era Leo290803/SIEP---IDJUV; o origin deste checkout ainda pode usar o endereço antigo, que o GitHub redireciona.
- Branch de entrega: main.
- Checkout deste trabalho: /workspace/SIEP---IDJUV. No outro ambiente, descubra o caminho real antes de executar comandos.
- Último commit funcional antes deste documento: 4e05b7c — centralização das configurações nas abas de Gerenciar evento.
- Site mostrado pelo usuário: https://siepidjuv.vercel.app
- Stack atual: React 19 + Vite 6 + JavaScript + lucide-react. Não é Next.js e não há backend implementado.
- Comandos: npm ci, npm run dev, npm test, npm run build.
- Última validação funcional: 46 testes automatizados passaram, build passou e fluxos relevantes foram testados com Chromium/Playwright.
- Alterações de código foram enviadas para main com autorização do usuário; a Vercel está integrada ao GitHub. Não afirmar que um deploy foi concluído sem conferir.
- Publicar o ambiente do Codex é diferente de fazer commit/push ou deploy do site.

Use o checkout existente. Cada tarefa em nuvem já é isolada; não crie worktree sem solicitação. Antes de atualizar o checkout, confira git status e as diferenças locais/remotas. Não faça reset, não sobrescreva alterações do outro chat e não envie uma versão antiga sobre trabalho mais recente. Não publique/republique o ambiente nem reaplique rascunhos antigos por conta própria.

## 3. Produto e instituições clientes

SIEP significa Sistema de Inscrições em Eventos e Projetos. A identidade inicial é do IDJUV/Roraima, mas o produto deve atender outros eventos e ser comercializado para outras secretarias e instituições.

Precisamos de separação por instituição cliente: dados, escolas, usuários, eventos, marca e configurações próprios. Não fixar regras dos Jogos Escolares de Roraima como padrão obrigatório de todos os eventos.

Nesta primeira experiência, a escola faz todas as inscrições. A evolução para clubes, municípios e outras entidades deve ser considerada no modelo, sem construir esses portais agora.

## 4. Acesso e identidade das pessoas

### Decisões para a futura autenticação

- A secretaria cadastra as escolas.
- O responsável solicita cadastro no sistema, pesquisa a escola e solicita vínculo.
- O vínculo só libera acesso após aprovação da secretaria. Escolher uma escola não pode conceder acesso imediatamente.
- Uma escola pode ter vários responsáveis com contas individuais e histórico de ações.
- Login pelo CPF foi planejado. Senha baseada em CPF/nascimento foi descartada em favor de criação de senha ou acesso inicial temporário seguro.
- Autenticação ainda não foi implementada. O usuário pediu para manter sem login enquanto constrói o fluxo; não apresentar o seletor de demonstração como controle de acesso.

### Dados pessoais fixos

Nome completo, data de nascimento, CPF válido e sexo são obrigatórios nos cadastros de atletas, responsáveis e comissão técnica, inclusive para salvar novos rascunhos de cadastro. Os demais dados do atleta e anexos dependem da pré-configuração do evento. Não criar exigência de registro de confederação para o atleta.

- O CPF é normalizado e validado por dígitos verificadores.
- Há bloqueios de duplicidade nos cadastros locais; no banco, definir a identidade e sua unicidade dentro da instituição cliente, sem expor pessoas de outros clientes.
- O código atual aceita Masculino e Feminino em gender.
- Nome completo não tem uma regra artificial de quantidade mínima de palavras.
- Dados antigos incompletos são preservados e sinalizados para revisão, não apagados.
- Responsáveis têm edição dos dados; aprovação exige os quatro dados válidos.
- Profissionais incompletos precisam ser revisados antes de entrar em novas inscrições.

## 5. Organização atual das telas — manter

O usuário pediu aparência de sistema administrativo: cabeçalho azul, tabelas, filtros e paginação. Não quer banners promocionais, excesso de cartões, frases decorativas, telas intermináveis ou controles duplicados. O logotipo oficial está na raiz do repositório e é importado pelo Vite.

- Seletor de área Secretaria/Escola é apenas demonstração.
- A escola da demonstração é escolhida no menu lateral.
- Na secretaria, o menu tem um único item Eventos.
- Na lista de eventos, Gerenciar abre uma página própria do evento, não um modal com atalhos para páginas globais.
- Abas de Gerenciar evento: Visão geral; Modalidades e categorias; Regras e limites; Formulário e documentos; Funções.
- O evento fica fixo no gerenciamento. Não há outro seletor de evento dentro dessas abas.
- Cada seção tem seu botão de salvar. Alternar abas preserva o preenchimento em andamento.
- Explicações e exemplos continuam disponíveis em Como funciona, recolhidos por padrão.
- Escolas, responsáveis, atletas e comissão técnica têm uma barra de ações/filtros, sem repetir títulos em vários cartões.

## 6. Evento ativo na área da escola

A escola escolhe Trabalhar neste evento uma vez. A escolha é mantida ao navegar e recarregar, separadamente por escola. Só escolhe outro ao usar Trocar evento, que abre a tela de eventos.

Não pedir o evento de novo a cada cadastro, documento, equipe ou inscrição. Na página, uma única linha compacta identifica o evento atual.

A escola representa as participações individuais e coletivas automaticamente. Não solicitar nome de equipe manual: a identificação é o nome da escola. O legado ainda usa teamName no objeto de rascunho, mas ele é preenchido automaticamente.

## 7. Cadastro de atleta, participação e documentos

O formulário de cadastro no evento reúne na mesma tela:

1. Dados pessoais, com os quatro campos fixos obrigatórios.
2. Seleção das modalidades/categorias pretendidas naquela edição.
3. Documentos exigidos pelo evento.

A pessoa pode ser reaproveitada entre eventos, mas as participações e os documentos são vinculados à edição. Editar um atleta existente permite completar sua participação em outro evento sem criar outra pessoa.

- A secretaria configura dados adicionais como não solicitar, opcional ou obrigatório.
- As exigências de anexos também são configuradas por evento. Um evento pode não solicitar anexo algum.
- Um documento comum é solicitado uma vez por atleta/edição, mesmo em várias modalidades.
- Arquivos atuais: PDF, PNG e JPEG, até 5 MB por arquivo; exigência de somente imagem é configurável.
- Rascunho de cadastro permite pendência de modalidades/documentos, mas não ausência dos quatro dados pessoais fixos.
- Concluir cadastro verifica dados, anexos e regras gerais aplicáveis. Isso NÃO envia inscrição, NÃO aprova a participação e NÃO ocupa vaga na prova.
- Atletas com cadastro completo e participação na categoria ficam disponíveis para montar as inscrições. Novas exigências reavaliam cadastros anteriores.

### Limitações importantes

Hoje o sistema salva anexos reais em IndexedDB e seus metadados no localStorage. Há upload/download local e tratamento de falha de gravação, mas nenhum arquivo é enviado ao Supabase ou à secretaria. Limpar os dados do navegador remove esse armazenamento.

A exigência de documentos específicos por modalidade/categoria foi discutida como evolução; a configuração implementada é por evento. Não afirmar que os anexos condicionais por modalidade já existem.

## 8. Modalidades, categorias e provas

Não voltar ao formulário único com todas as categorias expandidas.

- Criar a modalidade uma vez: Futsal, Atletismo etc.
- A modalidade guarda nome e classificação Individual/Coletiva.
- Abrir Configurar para consultar suas categorias em tabela com busca/paginação.
- Criar/editar uma categoria em janela individual, com participação Individual/Equipe, quantidade mínima/máxima de atletas e disponibilidade.
- Provas ficam dentro da categoria, cada uma com nome, tipo Individual/Revezamento e disponibilidade.
- Configurar uma prova por vez, sem empilhar dezenas de formulários.
- Categorias antigas continuam em event.categories; modalityGroups.js as agrupa e relaciona às modalidades, sem perder os identificadores.
- Renomear a modalidade atualiza suas categorias preservando as referências de categoria/prova e as regras.

### Filtro por anos de nascimento

Cada categoria tem birthYearStart e birthYearEnd. Ambos são inclusivos.

Exemplo pedido pelo usuário: Futsal / 12 a 14 anos configurado de 2011 a 2014 deve aparecer para atleta nascido em 2012. O texto 12 a 14 anos é identificação; não inferir automaticamente os anos a partir dele nem corrigir o intervalo escolhido pelo gestor.

- O cadastro do atleta mostra apenas categorias compatíveis com a data, além das categorias sem faixa configurada.
- Quando a data muda, seleções incompatíveis são retiradas com aviso.
- Configurar apenas um extremo ou inverter a faixa é recusado.
- Categorias antigas sem faixa ficam sem restrição até o gestor configurar.
- A faixa também é reavaliada nos cadastros completos e inscrições, não só no filtro visual.
- A configuração de gênero/naipe da prova e seu filtro ainda precisam ser implementados; hoje há o campo pessoal obrigatório, mas não esse filtro completo.

## 9. Regras esportivas

Não haverá etapas municipal/regional/estadual. As regras são por edição do evento, categoria e/ou prova. Regras gerais e específicas se acumulam.

Modalidade e tipo da prova são conceitos separados:

- Atletismo pode ser classificado como modalidade individual.
- Revezamento é uma prova dentro do atletismo e não ocupa uma modalidade coletiva adicional.

Exemplo central aprovado:

- Até duas modalidades por atleta: uma individual e uma coletiva.
- No atletismo: até duas provas individuais e um revezamento.
- 100 m + salto + revezamento + futsal é permitido nesse exemplo.
- Atletismo + badminton, futsal + basquete ou três provas individuais no atletismo geram pendência.

Esses limites são configuráveis. Não habilitar todos automaticamente nem fixar o exemplo para todos os eventos.

### Oito tipos implementados

| kind | Regra | Aplicação |
| --- | --- | --- |
| modalities | Total de modalidades, individuais e coletivas por atleta | Evento |
| athleteCategories | Categorias do mesmo esporte por atleta | Evento |
| proofs | Provas individuais e revezamentos por atleta | Categoria |
| proofEntries | Inscrições repetidas do atleta na mesma prova | Prova |
| roster | Mínimo/máximo de atletas por inscrição | Categoria ou prova |
| schoolEntries | Máximo de inscrições por escola | Categoria ou prova |
| age | Faixa de idade em data de referência explícita | Categoria ou prova |
| staffLimits | Mínimo/máximo de profissionais por inscrição | Categoria ou prova |

O catálogo inteiro fica visível. Cada regra informa onde pode se aplicar; o local é selecionado na janela de configuração. Há prévia, edição pela engrenagem, ativação/desativação e remoção confirmada. Vazio significa sem limite; zero bloqueia aquele máximo ou dispensa aquele mínimo.

Rascunhos contam na contagem atual; a edição de um rascunho não o conta duas vezes. As regras não somam inscrições de outro evento. Inscrições canceladas/indeferidas são excluídas onde houver esses estados.

Rascunhos com conflito esportivo podem ser salvos para correção e recebem aviso. O envio definitivo deverá bloquear pendências, mas ainda não existe.

## 10. Vagas numeradas por prova — especificado, ainda não implementado

O usuário forneceu e aprovou este fluxo para a evolução da inscrição:

- Gestor configura modalidade, prova, categoria/anos permitidos, sexo/gênero e N vagas por instituição/equipe.
- A escola abre a prova e encontra exatamente N seletores: Atleta 1, Atleta 2, Atleta 3 etc.
- Opções: somente atletas da escola, vinculados à modalidade naquela edição, compatíveis com nascimento e sexo/gênero, respeitando as regras esportivas.
- O mesmo atleta não pode ocupar duas vagas da mesma prova.
- Vagas são o máximo; quantidade mínima, inclusive para formar revezamento, é uma exigência separada.

O código atual de RegistrationDraft.jsx ainda usa checkboxes de atletas e provas, com seleção por categoria. Não dizer que os N seletores, o limite próprio de vagas de cada prova ou o filtro de sexo/gênero já foram entregues. O modelo do banco deve prever essa evolução, sem confundir capacidade por prova com quantidade de provas por atleta.

## 11. Duplicação de eventos

Duplicar está na lista de eventos e no gerenciamento. A cópia permite nome, edição e novas datas próprias; começa em Rascunho.

- Copia modalidades, categorias, faixas de nascimento, provas, limites, regras, campos, exigências de documentos e funções.
- Mantém opções ativas/desativadas.
- Gera novos identificadores e remapeia referências de modalidade/categoria/prova/regra/documento.
- Não copia pessoas, inscrições, arquivos enviados ou os contadores de participantes.
- Não reaproveita as datas de inscrição antigas.
- Datas de referência de idade e anos das categorias são copiados, com aviso para revisar na nova edição.
- Alterar a cópia não pode afetar o original.

## 12. Outros fluxos concluídos e pendências

Concluído localmente:

- Escolas: criar, editar, buscar, filtrar, arquivar e reativar; INEP opcional com verificação de duplicidade.
- Responsáveis: cadastro/edição, vínculo pendente, aprovação/recusa/encerramento/reabertura, justificativa e histórico de decisões.
- Comissão técnica: função, registro profissional informativo e contatos; busca, filtros, edição, arquivamento e reativação; funções permitidas por evento.
- Exportação de resumo de eventos em CSV.

Planejado, NÃO operacional no servidor:

- Autenticação, recuperação de acesso e autorização por instituição/escola/evento.
- Enviar inscrição para análise; aprovar, solicitar correção ou indeferir com justificativa; devolução à escola e histórico das versões.
- Prazos de correção, notificações por sistema/e-mail, relatórios completos e comprovantes.
- Transferência de atleta entre escolas com análise e preservação de histórico.
- Marca/domínio próprios e gestão comercial de clientes.

Funções adiadas pelo usuário, manter como Em breve:

- Competições: tabelas de jogos, resultados e classificação.
- Inscrições públicas sem conta. Quando voltar ao escopo, haverá acompanhamento por protocolo/link, separado do portal escolar.

## 13. Mapa do código e dados locais

| Arquivo | Responsabilidade |
| --- | --- |
| src/main.jsx | Estado geral, navegação, eventos, criação/duplicação, troca de área |
| src/EventWorkspace.jsx | Página Gerenciar evento e abas |
| src/EventCategories.jsx | Lista de modalidades, categorias e editor individual de provas |
| src/modalityGroups.js | Agrupamento e compatibilidade das categorias antigas |
| src/EventValidations.jsx / src/ruleCatalog.js | Catálogo e configuração das oito regras |
| src/participationRules.js | Verificação de participação entre rascunhos |
| src/categoryEligibility.js | Faixas de anos de nascimento |
| src/personData.js / src/PersonIdentityFields.jsx | Quatro dados pessoais obrigatórios e validações |
| src/EventRequirements.jsx / src/eventRequirements.js | Exigências por evento e reavaliação de cadastros |
| src/SchoolArea.jsx | Contexto da escola/evento ativo e rascunhos |
| src/Athletes.jsx / src/EventAthleteForm.jsx | Pessoas atletas e participação no evento em um formulário |
| src/RegistrationDraft.jsx | Prévia da inscrição por categoria com atletas, provas e comissão |
| src/localDocuments.js | Arquivos em IndexedDB |
| src/duplicateEvent.js | Cópia independente de configuração com remapeamento de IDs |
| src/Schools.jsx / src/Responsibles.jsx / src/TechnicalStaff.jsx | Demais cadastros locais |
| tests/ | Regras, identidade, exigências, elegibilidade, agrupamento e duplicação |

Chaves locais: siep-events, siep-schools, siep-athletes, siep-responsibles, siep-staff, siep-school-drafts e siep-active-event-<schoolId>. IndexedDB: siep-documents, store files.

Atleta: dados pessoais e schoolId; eventProfiles[String(event.id)] guarda categoryIds, documents, status (draft/complete), pending e updatedAt. documents guarda metadados/referências, não o conteúdo do arquivo.

Rascunho: id, schoolId, eventId, categoryId, modality, categoryName, participation, teamName automático, athleteIds, staffIds, proofIds, validationIssues e updatedAt.

Eventos antigos usam números como IDs; novos objetos usam também UUIDs. A migração precisa mapear IDs antigos sem quebrar as relações. O localStorage e o IndexedDB dos usuários no site não ficam no repositório ou no ambiente do agente; não presumir que esses dados já foram migrados.

## 14. Supabase e credenciais

- O usuário criou um projeto Supabase e autorizou preparar o acesso direto e criar a estrutura do banco.
- Nome da credencial preparada: SUPABASE_ACCESS_TOKEN.
- Destino HTTPS: api.supabase.com.
- É token administrativo da API do Supabase, não chave pública do site, não senha PostgreSQL e não service_role.
- O usuário mostrou a criação de token limitado ao projeto. Não inventar quais permissões foram efetivamente concedidas: verificar a operação necessária.
- No chat antigo, o executor continuou sem a variável; o usuário relata que o chat de destino tem acesso. Verificar no destino primeiro, sem pedir para gerar ou cadastrar outro token por reflexo.
- Reutilizar a credencial segura existente. Nunca imprimir seu valor, copiá-la para arquivo versionado ou prefixá-la com VITE_. Não colocá-la na Vercel nem no bundle React.
- Confirmar a referência do projeto correto pelo painel/API e pelo usuário quando necessário; não operar em outro projeto por suposição.
- Não foi executada nenhuma criação de tabela ou migração remota por este chat.

## 15. Próxima entrega: banco e camada de acesso

Este é o caminho recomendado, ainda não uma migração executada:

1. Atualizar o checkout com segurança e ler o estado atual. O usuário pode ter feito alterações no outro chat depois deste documento.
2. Verificar metadados de credenciais/ambiente e testar uma operação administrativa somente de leitura no projeto Supabase autorizado.
3. Inspecionar tabelas, políticas, extensões e armazenamento existentes antes de criar qualquer coisa. Preservar estruturas e dados já existentes.
4. Desenhar o modelo relacional e criar migrações SQL versionadas, por exemplo em supabase/migrations. Explicar o modelo concreto e continuar a implementação autorizada sem exigir que o usuário execute SQL manualmente se o acesso direto funcionar.
5. Validar as migrações em ambiente adequado e aplicar de forma controlada. Não usar DROP/TRUNCATE/reset para resolver conflitos em um banco com trabalho existente.
6. Criar uma camada de acesso/repositórios para retirar localStorage/IndexedDB das telas gradualmente. Manter a demonstração funcional durante a transição.
7. Integrar primeiro instituições, escolas e configurações de eventos; depois pessoas, participações, inscrições e arquivos.

### Entidades que o modelo deve contemplar

- Instituições clientes, identidade/configurações e vínculos de usuários com papéis.
- Escolas/entidades participantes e vínculos aprovados dos responsáveis.
- Pessoas com os quatro dados fixos; perfis/vínculos de atleta e profissional, sem duplicar a identidade em cada evento.
- Eventos/edições sem etapas; períodos e situação.
- Modalidades do evento, categorias com anos de nascimento e futuro sexo/naipe, provas com tipo e capacidade por instituição.
- Regras configuráveis com referências consistentes ao evento/categoria/prova.
- Campos adicionais e exigências de documentos por edição, com espaço para futura exigência condicional.
- Participação da pessoa no evento e modalidades/categorias pretendidas.
- Inscrições por escola/categoria/prova, ocupação de vagas e comissão técnica.
- Metadados de documentos ligados ao cadastro do evento e armazenamento privado dos arquivos.
- Histórico de decisões e versões para preservar inscrições já enviadas.

### Requisitos para a transição

- Separar dados pessoais reutilizáveis dos dados de participação/documentos da edição.
- Garantir consistência da instituição cliente nas relações, inclusive nas chaves estrangeiras; não depender só do filtro na interface.
- Validar CPF, intervalos, referências e regras também no servidor. Prevenir concorrência ao ocupar vagas e duplicidade do mesmo atleta na prova.
- Arquivos em Storage privado, com metadados no banco e acesso autorizado. Não armazenar PDFs/imagens como strings no registro da pessoa.
- Planejar RLS e permissões antes de expor dados pessoais pela API. O pedido de manter sem login não autoriza liberar escrita/leitura irrestrita para anon. É possível preparar/migrar o banco administrativamente e manter o portal em demonstração até ter acesso seguro.
- Não embutir credenciais administrativas no frontend para manter a interface sem login.
- Preservar configurações, permitir duplicação independente e prever histórico de regras/inscrições.
- Não prometer importar os dados dos navegadores sem construir e validar um mecanismo específico de exportação/importação.
- Distinguir claramente migrações preparadas, aplicadas e verificadas, e quais telas já usam o banco.

## 16. Como colaborar com o usuário

Converse em português, com explicações curtas e concretas. O usuário prefere testar e ajustar aos poucos. Quando disser antes de fazer vamos planejar, não implemente até autorizar. Pedidos de ação claros autorizam a execução necessária; não repetir perguntas de confirmação já respondidas.

Não pedir novamente todo o planejamento. Não propor telas duplicadas, não recolocar nome manual da equipe ou seleção de escola/evento em cada cadastro, e não reabrir autenticação como bloqueio para todo desenvolvimento do banco. Ao mesmo tempo, não apresentar a demonstração sem login como segura para operação real.

A tarefa imediata desta passagem é continuar a estruturação do banco no chat com acesso administrativo, preservando as decisões acima.
