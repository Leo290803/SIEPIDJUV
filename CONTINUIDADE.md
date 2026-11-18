# Continuidade do SIEP — contexto para o próximo chat

Atualizado em 18/11/2026. Este documento consolida as decisões do usuário e o estado real do código. Não contém credenciais. Leia também README.md e inspecione o checkout antes de começar.

## Correção guiada pela escola

Em **Minhas inscrições → Corrigir pendências** (ou Detalhes e histórico), inscrições em correção mostram orientação completa, prazo, ações por atleta/documento e reenvio no próprio fluxo. **Corrigir cadastro** abre o formulário existente do atleta no evento; **Corrigir documento** abre o mesmo formulário com foco no campo do anexo. A orientação permanece visível durante a edição. Salvar conserva o cadastro, retorna à inscrição e não reenvia automaticamente. A escola pode revisar o elenco e confirmar **Reenviar para análise**, usando a mesma RPC, revisão esperada e validações do evento. Prazo vencido desabilita reenvio no cliente e orienta procurar a Secretaria; validação de prazo no servidor permanece.

Não adiciona coluna, tabela ou migração. Decisões existentes continuam como texto em `registration_decisions.reason`. `registrationCorrections.js` cria atalhos apenas se uma linha corresponder exatamente a um rótulo único de atleta/documento do elenco e categoria atuais. Homônimos, nomes alterados, orientações gerais, comissão técnica ou documentos não identificáveis continuam como texto sem atalho inferido. A seção **Revisar atletas e anexos desta inscrição** oferece a escolha manual. Isso preserva solicitações antigas sem inventar um vínculo por semelhança de nome. Eventuais futuras orientações com IDs estruturados exigirão migração própria.

O indicador **Cadastro atualizado após a solicitação** compara `event_participations.updated_at` com o momento da decisão. Não significa pendência resolvida nem aprovação: a orientação continua visível e será reavaliada pela Secretaria. Dados/categoria/foto/anexos existentes são preservados pelo mesmo formulário e repositório de cadastro. Observações não são apagadas ou marcadas automaticamente como aceitas. A Secretaria continua com sua interface; a escola não recebe controles de decisão. Trocar de rota fecha o formulário de correção.

Validação: **106 testes JS**, build e fluxo Chromium com API simulada (correção de cadastro/documento, foco do anexo, salvamento/retorno, indicador de atualização, prazo vencido, reenvio, aprovação posterior e layout 390px). Testes unitários cobrem alvo exato, categoria, homônimos, pessoa fora da escola/removida, orientação livre e limite de prazo. Não afirma teste HTTP real do Supabase. Captura: `/tmp/siep-school-corrections-mobile.png`.

## Fila compacta e conferência contínua

A listagem de inscrições usa **10 registros por página no servidor** (demais listas continuam em 25), com `remote.limit` vindo do `pagePlan`. Na Secretaria há atalhos Aguardando análise/Em correção/Todas as inscrições que reutilizam o filtro de situação enviado à RPC paginada. Cada linha mostra Conferir inscrição ou Ver inscrição; demais operações ficam em Mais ações, exibido apenas se houver operações disponíveis. A escola conserva suas ações e permissões.

Na análise, a fila oferece inscrição anterior/próxima entre as enviadas da página atual, sem voltar à lista. Quando há outra inscrição enviada, a confirmação de aprovação/correção/indeferimento oferece **Confirmar e próxima inscrição**: decide somente a inscrição atual usando a revisão esperada e abre a próxima; não há aprovação em lote. O fim da página permite ir à próxima página da listagem, respeitando os filtros. Controles desnecessários ficam ocultos quando só existe um item.

O elenco mostra **um atleta por vez**, com seletor e anterior/próximo, conservando observações ao alternar atletas e inscrições. Rascunhos das observações ficam somente na memória da página e são limpos ao confirmar a decisão; recarregar/sair não persiste observações não enviadas. Fotos e anexos do atleta selecionado carregam automaticamente com acesso privado: imagem ou PDF têm prévia na própria tela, além do download dos documentos. Arquivos de outros atletas não são baixados antecipadamente; URLs Blob são liberadas ao trocar/fechar e existe repetição em caso de falha. Comissão técnica fica recolhida, carregando suas fotos ao expandir. Histórico permanece separado; a mensagem genérica de envio deixa de ocupar um cartão na conferência. No celular as ações ficam no fluxo para não cobrir os campos.

Nenhuma alteração de banco ou de cadastros existentes. Não muda a validação/autorização das decisões. Testes de navegador usam API simulada; incluem paginação real do fixture (13 inscrições/10 por página), filtro enviado à RPC, navegação entre inscrições, confirmação e avanço, fotos automáticas e fluxo escola/Secretaria. Captura da lista: `/tmp/siep-registration-queue-desktop.png`. Validação final: **103 testes JS**, build e fluxo completo Chromium aprovados. O navegador também verificou que só há um cartão de atleta por vez, observações preservadas ao alternar atletas e inscrições e nenhuma decisão automática sobre a próxima inscrição. Desktop e 390px sem overflow.

## Análise das inscrições pela Secretaria

Em **Inscrições e documentos → Inscrições → Detalhes e histórico**, a janela **Análise da inscrição** tem as abas Conferência e Histórico. Conferência reúne evento/escola/categoria/prova, situação, elenco com CPF/nascimento/sexo/status da participação, foto sob demanda, documentos por exigência do evento e comissão técnica. Dados do responsável legal aparecem somente com política ativa, atleta menor na referência e campos não ocultos. Documentos adicionais já enviados também podem ser baixados. A conferência usa o cadastro atual; versões históricas continuam explicitamente separadas e imutáveis.

Quando enviada, somente a Secretaria recebe campos de observação por pessoa/documento e ações Aprovar/Solicitar correção/Indeferir. As observações identificadas por nome/item preenchem a justificativa editável da solicitação, confirmada com prazo obrigatório. São persistidas na decisão existente, sem nova tabela ou migração; revisão concorrente e autorização continuam na RPC já utilizada. A escola vê a última decisão, justificativa com quebras de linha e prazo, com acesso para continuar a inscrição. Não recebe campos de análise ou ações da Secretaria. Observações ainda não confirmadas são locais; abrir a decisão e voltar preserva o preenchimento.

Arquivos privados são baixados apenas ao clicar, pelo adaptador autenticado existente, com mensagens de falha e limpeza de URLs Blob ao fechar. A lista permanece paginada pelo servidor. Não altera registros existentes, regras de aprovação ou módulos de competições. Testes de navegador usam API simulada, incluindo persistência da justificativa na decisão simulada; não representam teste HTTP real do Supabase. Validação: 102 testes JS, build de produção e fluxo completo no Chromium aprovados, com foto privada sob demanda, preservação das observações ao voltar, orientação visível à escola, ações restritas à Secretaria, histórico/recarregamento e conferência sem overflow em 390px. Capturas em `/tmp/siep-registration-review-desktop.png` e `/tmp/siep-registration-review-mobile.png`.

## Pendências exibidas somente após tentar concluir

A pedido do usuário, o quadro do cadastro do atleta no evento fica oculto ao abrir/preencher e só aparece após clicar **Concluir cadastro**, se houver pendências. Continua atualizando durante a correção e desaparece quando todas forem resolvidas; não mostra um cartão verde permanente. Salvar rascunho não abre esse quadro. Validações de campos e do banco permanecem. O teste conectado verifica ausência inicial, exibição após tentativa e desaparecimento após preencher.

## Responsável legal para menores e pendências navegáveis

Implementada a opção na aba **Formulário e documentos → Responsável legal do atleta**. A Secretaria ativa **Solicitar dados do responsável somente para menores de 18 anos**, informa a **Data de início do evento** e escolhe Não solicitar/Opcional/Obrigatório para nome, CPF, parentesco, telefone e e-mail. Os quatro primeiros começam como obrigatórios e o e-mail como opcional quando a opção é ativada. Eventos existentes continuam desativados por padrão.

- A data de início é explícita nesta configuração: o modelo anterior tinha somente datas de inscrição. Não confundir `event.start`/`registration_start` com essa referência. Política persistida em `events.settings.guardian = {enabled,referenceDate,fields}`. A idade usa aniversário completo de 18 anos na referência, sem fuso/calendário corrente; aniversário de 29/02 é tratado como 28/02 em ano não bissexto, de modo consistente em JS/SQL.
- O bloco do responsável aparece somente para quem ainda terá menos de 18 nessa data. Quem completar 18 até o início não recebe esses campos nem pendências do responsável. Nascimento posterior ao evento gera pendência na própria data de nascimento. Dados são informações do pai/mãe/tutor, sem criar pessoa, conta ou vínculo de responsável escolar.
- Valores ficam exclusivamente em `event_participations.additional_data`, com chaves `guardian_name`, `guardian_cpf`, `guardian_relationship`, `guardian_phone`, `guardian_email`. Não são enviados para contato/identidade global; mantêm as permissões de leitura da participação. Ocultar/desativar não apaga valores já salvos ou snapshots anteriores.
- Cadastro do atleta no evento ganhou **resumo de pendências no topo**, navegação por item e **Corrigir primeira pendência**. Clique destaca/foca o campo e mostra mensagem local; erros de campos, seleção de categoria e documentos são atualizados enquanto a pessoa preenche. CPF, data, sexo e nome continuam obrigatórios até para rascunho; demais exigências e regras bloqueiam a conclusão, com os dados preenchidos preservados. Foto geral continua opcional e independente de anexos configurados pelo evento.
- Duplicar evento preserva escolhas dos campos, mas desativa a solicitação e limpa a referência, exigindo configurar o início da nova edição. Isso evita usar a data da edição anterior para calcular a idade.
- Migração `20261116180000_minor_guardian_requirements`, aplicada no Supabase: valida formato da configuração inclusive em escrita direta, salva a política com verificação de versão e acrescenta a validação condicional à função de pendências já usada para concluir/enviar/aprovar. CPFs precisam ser válidos e diferentes do atleta, telefone com 10–15 dígitos/DDD, parentesco das opções previstas e e-mail válido quando preenchido. Campos ocultos são ignorados. Sem regravação de cadastros ou ativação automática em eventos existentes.
- Total: **25 migrações**, 31 tabelas públicas com RLS, **14 suítes SQL** e **102 testes JS**. SQL local/real verificou menor, adulto, aniversário de 18 anos, bissexto, dados inválidos/ausentes, envio bloqueado, aprovação com snapshot e recusa da escola ao configurar política. Chromium no build de produção com API simulada verificou configuração, ocultação no aniversário de 18, foco/destaque, conservação do nome/foto selecionada, persistência por evento e fluxo completo posterior, desktop/390px. Capturas em `/tmp/siep-guardian-settings-*.png` e `/tmp/siep-guardian-pending-*.png`. HTTP real do Auth/Storage continua fora da validação pela restrição de rede já registrada.

## Atletas de teste na Escola Estadual Monteiro Lobato

A pedido do usuário, criados **somente 12 atletas** na escola existente `ESCOLA ESTADUAL MONTEIRO LOBATO` (`93c5caf0-c457-4b76-9922-16887dc4ca5c`): seis femininos e seis masculinos, anos correspondentes a 12–17 anos e nomes com prefixo **Atleta Teste**. Não foram criados responsáveis, profissionais, contas Auth, participações em evento ou inscrições. Não houve associação/alteração de fotos nesta operação.

Script manual `scripts/seed_school_athletes.py`, padrão rollback, `--apply` para persistir, IDs determinísticos por escola e marcador `siep-school-athletes-v1`. Usa RPC de cadastro e confere que inscrições, contas, outros papéis e participações permanecem com as mesmas contagens. Reexecução preserva edições dos atletas já criados. Validação e aplicação feitas no Supabase; a consulta paginada sob o responsável aprovado da escola retornou os 12 atletas.

O e-mail que o usuário informou para localizar o acesso não foi encontrado em Auth, identidades ou contato das pessoas. Os atletas foram vinculados à escola confirmada, sem criar ou transferir acessos. Essa diferença deve ser comunicada ao usuário; não afirmar associação do lote àquela conta.

## Validação do fluxo escolar completo

Após autorização do usuário, ampliado e executado o teste conectado no build de produção: a escola completa o cadastro no evento com foto/anexo, cria e envia inscrição; a Secretaria pede correção com prazo; a escola abre Continuar, salva e reenvia; a Secretaria aprova. Uma asserção verifica a sequência e o perfil de cada transição. A escola não recebe ação Aprovar. Histórico/recarga, emissão/reimpressão de crachá com foto e PDF/CSV filtrados também passaram. Teste separado verificou geração de acesso sem e-mail e login CPF com API simulada.

A suíte SQL `workflow.sql` agora também salva efetivamente a comissão durante a correção e verifica o snapshot aprovado na revisão 6. As 13 suítes passaram no PostgreSQL local e no Supabase real com rollback, sem migrações pendentes e sem alterar os exemplos. Nenhuma conta Auth real foi criada nesta rodada. Evidências, comandos e limites: [VALIDACAO_FLUXO.md](VALIDACAO_FLUXO.md).

Continua pendente o HTTP real de login/upload: a conexão de saúde do Auth foi tentada novamente e recusada por 403 do proxy. Não afirmar teste real completo ou confundir os mocks do navegador com essa validação. Nenhuma mudança de produto foi necessária nesta rodada.

## Correção do histórico e fotos fictícias nos exemplos

Corrigido o erro **“all is not defined”** ao clicar **Detalhes e histórico**: a leitura do histórico ainda referenciava o antigo carregador geral removido na paginação. `portalRepository.history` agora consulta somente versões/decisões da instituição e inscrição escolhidas, em lotes de 500, com ordenação estável, prazo de consulta e cancelamento ao sair. Testes cobrem escopo, histórico vazio, mais de 500 revisões, falha de permissão e cancelamento. Chromium no build de produção verificou abertura, conteúdo, recarga da URL de histórico e fechamento.

- Foram criados dois retratos inteiramente fictícios por geração de imagem e associados aos **45 cadastros de exemplo** existentes (36 atletas, seis profissionais, três responsáveis). São imagens compartilhadas para visualização; não representam pessoas reais nem identificação dos nomes usados nos exemplos. Fotos que o usuário já tivesse colocado são preservadas.
- O domínio do projeto continua bloqueado para upload Storage pelo executor (403 de rede). Para este conjunto pequeno de desenvolvimento, os dois arquivos são armazenados uma única vez em `siep_private.development_photo_assets`, com associação a versões em `development_photo_links`. Namespace lógico `siep-development-photos`, servido por `siep_read_development_photo`, exige sessão e autorização da pessoa/instituição. Não existe bucket público nem objeto Storage fictício. Uploads normais continuam no bucket privado `siep-person-photos`.
- Migração `20261116160000_development_photo_assets`, aplicada e verificada: **24 migrações**, 31 tabelas públicas com RLS e 13 suítes SQL. As duas tabelas de bytes/associações ficam no schema privado sem SELECT direto de authenticated/anon. Cada arquivo tem hash SHA-256 conferido e bytes limitados a 5 MB; os dois originais somam cerca de 4,08 MB, sem duplicação por pessoa. Este mecanismo é somente para os exemplos, não uma troca do backend de fotos reais.
- `downloadAttachment.js` centraliza a leitura de arquivo para os formulários e crachás: desenvolvimento usa a RPC protegida; fotos/documentos normais usam Storage. A prévia usa Blob temporário. Substituição/remoção continuam versionadas, preservando fotos históricas usadas em crachás.
- Script manual `scripts/seed_development_photos.py --project-ref ... --male /caminho/imagem.png --female /caminho/imagem.png`: upload dos bytes privados em blocos retomáveis, verificação de hash e associação apenas aos IDs/metadados dos exemplos. Não substitui foto atual, não recoloca versão removida nem cria usuários/e-mails. As imagens não são embutidas no bundle público ou nas migrações.
- Validação: 94 testes JS, build, 13 suítes SQL locais e validação/aplicação no Supabase real. Leitura dos bytes foi conferida sob papel `authenticated`; candidatos a crachá do evento de exemplo têm foto disponível. Chromium com API simulada verificou emissão, imagem carregada, impressão e reimpressão com o novo namespace.

## Exemplos persistidos para explorar o sistema em desenvolvimento

A pedido do usuário, foram inseridos exemplos no IDJUV pelo script operacional `scripts/seed_development.py`, sem reintroduzir a tela de demonstração/login público e sem alterar cadastros anteriores. O usuário confirmou que o sistema ainda está em desenvolvimento, sem público externo.

- Evento aberto **Exemplo — Jogos Escolares de Desenvolvimento**, ID `2e80033a-625b-517d-bcde-62c0bc5eef2f`, edição do ano da criação. Três escolas fictícias: Horizonte (Boa Vista), Estrela do Norte (Pacaraima) e Caminho do Sol (Rorainópolis), todas com prefixo “Exemplo”. Cada escola tem esse evento selecionado como contexto de trabalho.
- 36 atletas (12 por escola, masculino/feminino e faixas 12–14/15–17), seis profissionais e três responsáveis pendentes, sem conta Auth criada. Não foram geradas senhas nem enviados e-mails. Os responsáveis podem ser usados depois para testar **Gerar acesso**, se desejado. CPFs são sintéticos com dígitos validadores; não usar estes dados como cadastros pessoais reais.
- Futsal, atletismo e badminton; seis categorias por faixa/sexo e quatro provas de atletismo (100 metros e salto em distância para cada sexo). Regras limitam duas modalidades por atleta, uma individual e uma coletiva.
- 24 inscrições criadas pelas RPCs reais de salvar/transicionar, quatro em cada situação: rascunho, enviada, aprovada, correção solicitada, indeferida e cancelada. Elencos, comissão, revisões, decisões e snapshots correspondem ao fluxo real. Sem anexos ou exigências documentais adicionais. Fotos fictícias foram acrescentadas na atualização descrita acima.
- Relatório geral do evento tem 42 linhas de participação em inscrições, 30 pessoas distintas, 24 inscrições e três escolas. Seis dos 36 atletas estão cadastrados sem inscrição, permitindo testar esse caso. Filtro feminino retorna 21 linhas e 15 atletas distintos.
- Script não integra as migrações nem roda automaticamente: padrão valida com rollback; `--apply` persiste. IDs/versão determinísticos e trava transacional evitam duplicação; ao encontrar o evento já criado, não regrava alterações feitas pelo usuário. Teste `python scripts/test_development_seed.py` cria banco local descartável e verifica validação com rollback, persistência, reexecução e seis situações. Validação, aplicação e consultas das RPCs como `authenticated` foram conferidas também no Supabase real.

## Escala: carregamento por tela, consultas paginadas e exportação isolada

Preparado o caminho de leitura para eventos com mais de 10 mil atletas. `siep_portal_page` substitui o carregamento completo das tabelas no portal; páginas reais de 25 para atletas, comissão, responsáveis e inscrições, contagens no painel e notificações limitadas. Detalhes fora da página são consultados por ID com o mesmo escopo. Participações/documentos restringem-se aos registros e evento necessários. Catálogos de escolas e configurações continuam completos. Respostas obsoletas são ignoradas; busca tem espera de 350 ms e cancelamento de consultas substituídas. `mapPortalData` usa índices em memória, sem varrer todos os relacionamentos para cada pessoa.

- `siep_report_page`: filtros, agrupamentos, totais distintos, ordenação e paginação no PostgreSQL, até 500 linhas por chamada. Exige Secretaria aprovada; escola e anônimo são recusados. `siep_portal_page` exige Secretaria ou escola explicitamente autorizada e preserva o escopo por pessoa/histórico. `siep_badge_page` limita candidatos; seleção de crachás é por página, com emissão/reimpressão existentes preservadas.
- PDF/CSV são montados em Web Worker, consultados sequencialmente em lotes de 500, com progresso, cancelamento e limite de 120 s/20.000 linhas por arquivo. Resultado maior exige dividir filtros, sem truncar. Marcador da auditoria recusa exportação se o conjunto mudar entre páginas. Não é uma fila persistente de servidor; detalhes e limites em [DESEMPENHO.md](DESEMPENHO.md).
- Três migrações incrementais `20261116140000_paged_reports`, `20261116141000_portal_pages`, `20261116142000_badge_pages`: novas RPCs/índices, sem exclusões nem regravação de cadastros. Total: 23 migrações e 31 tabelas públicas com RLS. Uma suíte SQL adicional verifica páginas, filtros, datas, escopo, agrupamentos, limites e alteração durante exportação (12 suítes).
- Teste local descartável: 10.000 atletas, 100 escolas, 20.000 inscrições. Relatório geral e resumo por escola perto de 0,74 s; filtro escola/sexo/categoria perto de 0,17 s nesta máquina. Não extrapolar para o hardware/plano Supabase. Um plano genérico lento foi substituído por SQL parametrizado com planejamento por filtros. Script `npm run test:scale` nunca usa Supabase/token.
- 87 testes JS; PostgreSQL local e três cenários concorrentes; Chromium no build de produção, inclusive acesso gerenciado. Teste de navegador com API simulada/10.001 pessoas verificou paginação real, PDF completo (501 páginas/~1,36 MB), responsividade durante geração e cancelamento; texto extraído conferiu todos os nomes. Validação pequena também executada no Supabase real; nenhum volume de 10 mil cadastros foi criado lá. Não representa teste HTTP real do PostgREST ou capacidade garantida de pico.

## Relatórios detalhados, filtros e exportação PDF/CSV

Na Secretaria → **Inscrições e documentos → Relatórios**, a antiga tela de totais foi substituída por oito listagens: inscrições, atletas nas inscrições, cadastro de atletas, cadastro da comissão técnica, comissão nas inscrições, responsáveis escolares, escolas e eventos. Os filtros combinam evento, escola, sexo, município, modalidade, categoria, prova, situação da inscrição, pesquisa por nome/escola/CPF, período de criação da inscrição, ano de nascimento e presença de foto. Cadastros permitem também situação do vínculo e inclusão de arquivados.

- Apresentação detalhada ou agrupamentos por escola, sexo, categoria, modalidade, prova, município, situação ou foto, conforme as colunas do tipo escolhido. Colunas selecionáveis, ordenação, paginação e orientação do PDF. CPF, nascimento e contatos ficam desmarcados por padrão.
- **Exportar PDF** baixa arquivo A4 diretamente com jsPDF/AutoTable carregados sob demanda, cabeçalho institucional, filtros, ordenação, totais e numeração de páginas; tabelas extensas quebram vertical/horizontalmente. **Exportar CSV** usa UTF-8/BOM, ponto e vírgula, aspas e proteção contra fórmulas. Ambos incluem todas as linhas filtradas e as colunas escolhidas, não somente a página visível. Planilhas podem aplicar sua própria formatação aos campos numéricos; importar CPF como texto preserva zeros iniciais.
- Uma pessoa em duas inscrições gera duas linhas em “Atletas nas inscrições”, mas uma pessoa distinta. Inscrições mistas com filtro por sexo mostram o número de atletas encontrados; “Total do elenco” é uma coluna opcional separada. Sexo da comissão/responsáveis filtra a própria pessoa. Responsáveis relacionados a evento são responsáveis de escolas com inscrições, não inscrições pessoais inventadas. Datas de criação são comparadas pelo dia em America/Manaus.
- Implementação em `src/Reports.jsx` e `src/reports/`. Consulta páginas pela RPC autenticada `siep_report_page`, mantendo as rotas e autorizações. Exportação é local em worker; os incrementos de banco estão descritos acima.
- Validação: 82 testes JS, build de produção e fluxo completo Chromium com API simulada. Navegador verificou combinação escola/sexo/categoria, resultado vazio, agrupamentos, downloads reais PDF/CSV e todos os tipos. Capturas desktop/390px sem transbordamento externo; PDF inspecionado com `pdfinfo`/`pdftotext`, incluindo filtros, escola, nome e acentos. PDF com 120 linhas também testado. Não representa teste HTTP do Supabase real nem implantação publicada.

## Inscrições, relatórios e crachás unidos na Secretaria

A Secretaria agora tem um único item **Inscrições e documentos**, com abas roteadas **Inscrições**, **Relatórios** e **Crachás**. As URLs existentes `/secretaria/T/inscricoes` e `/secretaria/T/relatorios` continuam funcionando; nova `/secretaria/T/crachas`. A escola mantém seu portal anterior. As exportações de eventos e inscrições continuam disponíveis pelo seletor de tipo na nova tela de relatórios.

- Crachás: seleção por evento, escola e perfil (atleta, comissão técnica ou responsável), pesquisa e lotes de até 50. Atletas/profissionais precisam constar em inscrições aprovadas do evento. Responsáveis precisam de vínculo aprovado/conta associada e escola com inscrição aprovada. Foto de identificação obrigatória para a emissão; cadastros sem foto ficam visíveis como pendência.
- A emissão abre prévia com foto, nome, escola, perfil, instituição, evento/edição, identificador e versão. CPF e nascimento não são impressos. Botão **Imprimir / Salvar PDF** usa a impressão do navegador; A4, quatro crachás por página, formato 86×130 mm. Não houve acionamento de impressora real nos testes.
- `EventBadges.jsx` e `BadgePrint.jsx` implementam seleção, impressão e reimpressão. As fotos e o logo são carregados antes da impressão, em URLs de Blob temporárias; downloads sequenciais reutilizam a mesma imagem entre papéis. Textos são renderizados pelo React. O popup não recebe tokens de sessão.
- Migração `20261113160000_event_badges`: tabela pública `event_badges`, com RLS exclusiva da Secretaria, snapshots imutáveis, versão por evento/escola/pessoa/papel e auditoria. RPCs `siep_badge_candidates` e `siep_issue_event_badges` verificam o escopo no servidor, aprovação, foto, duplicatas e limite de lote. A reimpressão usa o snapshot e a versão da foto original; novas emissões preservam as anteriores. Secretaria pode ler foto histórica de pessoa arquivada; isso não libera novo upload de identidade arquivada.
- Total: 20 migrações, 31 tabelas públicas com RLS, 11 suítes SQL reais com fixtures desfeitas e 73 testes JS. Chromium com API simulada verificou abas, emissão, prévia, comando de impressão e reimpressão sem nova emissão, desktop/mobile. `npm run test:badge-print` verificou 5 crachás fictícios em 2 páginas A4 e textos longos sem cortes. O domínio do projeto ainda depende da liberação de rede para teste HTTP real de ponta a ponta.
- Emissão salva não comprova impressão física: se o download/abertura da prévia falhar ou a impressão for cancelada, use o histórico para reimprimir. Evento arquivado não aceita nova emissão, mas preserva o histórico. Sem QR público ou endpoint público de verificação nesta entrega.

## Foto de identificação em todos os cadastros de pessoas

Atletas (cadastro geral e cadastro no evento), comissão técnica e responsáveis têm foto opcional, com prévia, seleção/substituição, remoção e cancelamento da alteração antes de salvar. PNG/JPEG até 5 MB; o navegador verifica se a imagem pode ser decodificada. A foto fica na identidade reutilizável, compartilhada entre papéis e escolas autorizadas, sem duplicar pessoa ou exigir que a Secretaria configure um documento do evento.

- `PersonPhoto.jsx` mostra somente uma prévia local ou Blob baixado com a sessão. Não salva imagem/base64/URL pública em localStorage ou contato. A foto é enviada somente ao salvar o cadastro; falha preserva os dados já salvos e a foto anterior, com orientação para reabrir/revisar.
- Migração `20261113150000_person_photos`: tabela pública `person_photos` com RLS (total 30 tabelas públicas) e bucket privado `siep-person-photos`. Preparar → upload autenticado → finalizar verificando existência/MIME/tamanho. Upload pendente não desativa a foto anterior; versões anteriores não são sobrescritas nem apagadas. Substituição e remoção exigem a foto esperada e recusam edição concorrente. Leitura/escrita seguem `can_person` e o escopo institucional/escolar.
- Cada versão tem ID/caminho próprio, que poderá ser referenciado pelo crachá. O gerador foi implementado no módulo descrito acima, usando evento/inscrição autorizados e preservando a versão da foto usada na emissão. Não tratar foto como uma inscrição ou como aprovação do vínculo.
- As exigências de documentos do evento continuam independentes e preservadas. Uma exigência de anexo chamada Foto não é automaticamente satisfeita pela foto geral sem um contrato explícito de correspondência.
- Durante os testes foi encontrado um erro da consulta de elegíveis ao avaliar uma pessoa fora do contexto de uma categoria. `20261113145000_safe_candidate_validation` faz o predicado retornar pendência/excluir o candidato em vez de interromper a consulta. As regras esportivas não foram flexibilizadas.
- Total: 19 migrações. Dez suítes SQL no Supabase real com fixtures desfeitas, 72 testes JS e Chromium com API simulada cobrem upload, substituição, remoção, reutilização entre papéis, recarga, formato inválido e limites/permissões/conflito. Upload real de bytes no domínio do projeto continua dependendo da liberação de rede pendente do ambiente; não afirmar esse teste como realizado.

## Revisão geral de alinhamento das telas

A pedido do usuário, revisados os dois portais, todas as cinco abas de evento e os formulários/janelas em larguras de 1440, 1024 e 390 pixels. A grade global de fieldsets comprimindo o conteúdo foi substituída por blocos estruturais e grade explícita somente para opções. Corrigidos campos/ações de eventos, inscrições, Instituição e usuários, alinhamento de rótulos com quebras, formulários de provas no celular e transbordamentos. Não reintroduzir grade de duas colunas em todo `fieldset`.

Relatório e comandos: [REVISAO_VISUAL.md](REVISAO_VISUAL.md). `scripts/audit_layout.cjs` usa os fixtures do teste conectado e gera capturas/medições; execute com `SIEP_LAYOUT_AUDIT=after` e `details`. Os testes não gravam no Supabase real. Permissões, rotas e contratos do banco permanecem os existentes.

## Notificações no cabeçalho

O acesso às notificações foi movido do menu lateral e das abas de acompanhamento para um sino junto de Conta conectada no cabeçalho dos dois portais. O botão indica a quantidade não lida (limite visual 99+), tem rótulo acessível/tooltip e abre a mesma rota de notificações da conta. Em celular, o texto de status é ocultado para manter o sino acessível. Leitura e permissões existentes foram preservadas.

## Configurações junto do perfil

A tela Instituição saiu da lista principal e é acessada pela engrenagem ao lado do nome/papel do usuário no rodapé da barra lateral. O botão tem rótulo acessível, tooltip e estado ativo. Visível somente ao administrador no portal da Secretaria; a rota e a autorização de administrador foram mantidas.

## Login reorganizado e demonstração retirada da entrada

A pedido do usuário, removidos o botão/texto de demonstração e o carregamento do DemoApp na entrada. `/demonstracao` agora redireciona ao login. O arquivo legado e os dados de localStorage/IndexedDB não foram apagados. Não reintroduzir acesso à demonstração no produto.

O login único tem cartão compacto, logo sem o excesso de espaço transparente, campos empilhados, botão de largura completa, controle mostrar/ocultar senha e layout móvel. Fluxos de CPF/e-mail, senha gerada sem troca obrigatória e permissões permanecem. Build e Chromium verificaram login/recuperação, acesso gerenciado e layout desktop/mobile, com HTTP do provedor simulado.

## Senha gerada sem troca obrigatória — decisão mais recente

O usuário retirou a exigência de troca no primeiro acesso. O responsável entra diretamente na escola autorizada com a senha gerada (ano de nascimento + quatro últimos dígitos do CPF). O frontend não chama mais a verificação de troca; novas contas não recebem a marca administrativa. A migração `20261112180000_remove_required_initial_password_change` remove somente as marcas antigas, sem mudar hashes/senhas, e mantém a RPC de compatibilidade retornando false. São 17 migrações. Não reintroduzir a exigência. Contas que já alteraram sua senha mantêm a senha atual; não redefinir automaticamente.

Validados build, 69 testes JS, nove suítes SQL no Supabase com rollback e fluxo de geração/login CPF no navegador com HTTP simulado. A alteração remove a obrigação de trocar, sem bloquear a API de alteração voluntária de senha do Auth.

## Login único — decisão mais recente

Removidos os links visuais de escolha Secretaria/Escola. A entrada é única, com CPF ou e-mail e senha. O banco informa os vínculos aprovados e a navegação abre automaticamente a Secretaria para funcionários ou a escola autorizada para responsáveis. URLs antigas de login redirecionam a `/entrar`, preservando retorno interno de links protegidos. Os portais, rotas e permissões continuam separados. Não reintroduzir escolha de área na tela de login.

## Acesso escolar gerado pela Secretaria — decisão atual (substitui solicitações abertas)

O usuário retirou a inscrição pública de contas e definiu acesso sem e-mail. A Secretaria cadastra o responsável, CPF, nascimento e escola, salva e usa **Gerar acesso**. O botão pede confirmação do responsável/escola. Usuário = CPF com 11 dígitos (preserva zeros iniciais); senha inicial = ano de nascimento + quatro últimos dígitos do CPF. Exemplo fornecido pelo usuário: CPF `04182530217`, nascimento `2003-08-29`, senha inicial `20030217`.

- A senha inicial é previsível e foi explicitamente escolhida pelo usuário. **Troca obrigatória no primeiro acesso**: a marca é metadado administrativo do Auth, conferido no servidor; RLS bloqueia dados escolares até mudar a senha. O gatilho do Auth remove a marca ao atualizar o hash. Nova senha tem mínimo de 10 caracteres na interface.
- Cadastro público removido da interface, URLs antigas redirecionam para login e `disable_signup=true` no Supabase Auth. As RPCs de solicitação/diretório aberto perderam EXECUTE de anon/authenticated. Históricos e vínculos anteriores foram preservados; contas existentes por e-mail continuam entrando.
- Duas Edge Functions ativas: `provision-school-access` verifica sessão, autorização da Secretaria e o vínculo antes de criar uma conta Auth; `cpf-login` resolve a conta sem expor o endereço interno e autentica a senha no Auth. O endereço interno `CPF@cpf.siep.invalid` serve somente ao provedor; não exige e-mail do responsável e não recebe mensagens.
- A senha inicial só volta na resposta de criação e aparece temporariamente no painel da Secretaria, junto da escola. Não é armazenada em tabela, localStorage, logs ou código do cliente. O Auth guarda o hash. Gerar acesso de uma conta existente preserva a senha atual e não retorna senha anterior.
- Login CPF tem limite de 10 tentativas em 15 minutos por CPF no backend e resposta genérica. Contas ambíguas ou sem vínculo aprovado não entram. CPF não é tratado como número.
- Migração `20261112170000_secretariat_managed_school_access` aplicada; total de **16 migrações**, 29 tabelas públicas com RLS e nove suítes SQL. A tabela de controle de tentativas é privada. Funções de autorização/resolução reservadas a service_role; chave administrativa apenas no runtime do Supabase.
- Validação: 69 testes JS, nove suítes SQL, três cenários concorrentes PostgreSQL, testes de endpoints com HTTP simulado e Chromium (fluxo geral + Secretaria gera acesso, login CPF, troca obrigatória e escola correta). SQL verificado no Supabase real com fixtures desfeitas. Endpoints confirmados ACTIVE pela API administrativa; HTTP real de Auth/Edge no domínio do projeto continua bloqueado no executor. Não afirmar teste real de criação de conta/login por CPF nem entrega de mensagens.
- Nenhuma conta real foi criada pelo agente para teste, nenhum e-mail foi enviado e nenhuma senha existente foi redefinida. A publicação do ambiente não foi executada.
- Comandos: `npm run test:access-browser`; reimplantação dos endpoints com `python scripts/deploy_school_access.py --project-ref REF`. O script usa a credencial segura existente e não imprime seu valor. Vínculos legados continuam disponíveis para revisão da Secretaria.
- Recuperação de conta por CPF sem e-mail deve passar pela Secretaria; esta entrega preserva recuperação por e-mail de contas legadas e não implementa redefinição administrativa de senhas existentes. Não redefinir contas globais ao vincular a outra escola.

## Solicitação simplificada com confirmação da escola — atualização mais recente

- Escolas do IDJUV são carregadas automaticamente; não há campo para digitar o código da instituição. O responsável informa somente nome (pré-preenchido do `display_name` da conta quando disponível) e escolhe explicitamente uma escola, sem seleção automática.
- Um quadro destaca nome completo da escola, instituição e INEP quando cadastrado. A confirmação da escola é obrigatória; mudar a seleção desmarca a confirmação e bloqueia o envio. A confirmação final repete a escola efetivamente enviada.
- Nova RPC `siep_request_school_access(uuid,text)` aceita apenas conta com e-mail confirmado, grava vínculo pendente e mantém a aprovação pela Secretaria. Nome não concede identidade nem mescla pessoas; a reutilização usa vínculo anterior da própria conta na mesma instituição.
- Migração `20261112160000_simple_school_access` permite CPF/nascimento/sexo todos ausentes para identidade inicial de responsável, sem valores fictícios. Os dados podem ser completados depois na edição do cadastro. Dados já existentes não são apagados. Atletas, profissionais e participações continuam exigindo identidade completa por gatilhos no banco; não se pode esvaziar os dados de uma identidade esportiva existente.
- Total: 15 migrações e oito suítes SQL, além dos 64 testes JS e três testes concorrentes. SQL verificado localmente e no Supabase real; navegador verificou seleção, troca/confirmar, envio com escola correta, erro preservando dados e desktop/mobile usando API simulada.

## Tela de solicitação escolar organizada

A tela de acesso pendente agora separa busca da escola e dados do responsável em duas etapas visuais, com campos alinhados e layout móvel. O código da instituição tem exemplo `idjuv`, distinto do nome da escola. Busca vazia, erros preservando o formulário e confirmação de envio têm mensagens próprias; o botão de atualização fica no rodapé. Não houve mudança nas permissões nem no banco. Chromium verificou busca/seleção/envio/falha e desktop/mobile com API simulada.

## Portais separados, autenticação e permissões — atualização mais recente

Esta seção substitui o seletor de área e as contagens das entregas históricas abaixo.

- Entradas independentes: `/secretaria/entrar` e `/escola/entrar`. Após autenticar, a conta só acessa vínculos aprovados retornados por `siep_my_access`, verificados no servidor. O portal conectado não possui seletor Secretaria/Escola.
- Rotas reais para todos os módulos existentes, abas de evento, cadastro/edição de pessoas e edição/histórico de inscrições. Recarregar, compartilhar URL e voltar mantêm o contexto; `vercel.json` permite abrir URLs internas. Inventário: [ROTAS.md](ROTAS.md).
- Secretaria: admin e manager. Instituição e Usuários da Secretaria exigem admin. A gestão de usuários associa contas já confirmadas, permite encerrar o vínculo e protege o último administrador; não cria senhas nem envia mensagens.
- Escola: somente responsável com vínculo aprovado e ativo naquela escola. Ser administrador não cria vínculo escolar. A Secretaria usa o caminho explícito de acompanhamento da escola, mantendo sua identidade administrativa.
- Sessão obrigatória, retorno interno validado, páginas de acesso negado/404, recuperação de senha e logout. Permissões são revalidadas ao focar a janela e a cada minuto; RLS e RPCs verificam cada operação no banco e bloqueiam a revogação imediatamente.
- Nova migração versionada `20261112150000_portal_access_and_staff_accounts`: total de 14 migrações, preservando as 29 tabelas públicas e os dados existentes. Não editar migrações aplicadas.
- Validação: 64 testes JS, sete suítes SQL, três cenários concorrentes PostgreSQL e navegação Chromium com API simulada. SQL/RLS também verificados no Supabase real. A simulação HTTP não comprova entrega de e-mail ou disponibilidade do provedor de autenticação.
- Demonstração local continua em `/demonstracao`; dados antigos não foram apagados/importados. Competições e inscrições públicas continuam Em breve. Nenhuma publicação do ambiente autorizada ou executada.

## Navegação completa conectada — estado mais recente

O usuário apontou que as telas já construídas haviam desaparecido ao entrar com login e autorizou integrá-las. Esta seção substitui a limitação da entrega anterior: o portal conectado agora mantém a navegação completa.

- Secretaria: Visão geral, Eventos, Escolas, Responsáveis, Atletas, Comissão técnica, Inscrições, Relatórios, Notificações e Instituição. Competições e Inscrições públicas continuam visíveis como Em breve, conforme decisão anterior.
- Área da escola: Visão geral, Eventos disponíveis, Atletas, Comissão técnica, Minhas inscrições, Notificações e Dados da escola. Responsáveis veem apenas escolas autorizadas pelo banco. Secretaria pode trabalhar nessa área com as próprias permissões administrativas; o seletor não concede direitos.
- `ConnectedApp.jsx` carrega identidade/acesso; `InstitutionPortal.jsx` coordena o painel e os módulos; `ConnectedForms.jsx` guarda os formulários já conectados; `ConnectedRegistrations.jsx` implementa elenco, posições numeradas, comissão, prévia, envio/correção/aprovação/cancelamento e histórico. O layout administrativo e a navegação móvel foram mantidos.
- Atletas, comissão técnica e responsáveis reaproveitam os componentes existentes com registros e callbacks assíncronos. O caminho conectado não grava em localStorage/IndexedDB. Uma pessoa pode ter vários papéis/escolas sem duplicar CPF; IDs do vínculo são separados dos IDs da identidade.
- `portalRepository.js`/`peopleMapping.js` carregam o escopo permitido por RLS. O cadastro reutilizável é separado dos dados adicionais/documentos da edição. O evento ativo é salvo por escola no banco e reutilizado nos formulários.
- Arquivos são enviados pelo cliente ao Storage privado, após preparar metadados; finalização verifica objeto, MIME e tamanho. O download usa a sessão autorizada. Se uma etapa de upload falhar, o cadastro já gravado fica explicitamente em rascunho para revisão, sem falso sucesso e sem apagar arquivos anteriores.
- Envio e análise de inscrições usam revisão esperada e RPCs existentes. Rascunhos podem guardar pendências e exibem aviso; envio/aprovação revalidam. Relatórios exportam dados reais da instituição em CSV, com proteção de fórmulas. Notificações internas são da própria conta e podem ser marcadas como lidas; o worker externo de e-mail continua separado.
- **Treze migrações aplicadas e verificadas**, sem pendências. Novas: `20261112140000_connected_people_and_documents` e `20261112141000_relay_category_limits`. Acrescentam arquivamento/versão por perfil, gravação de identidade+participação em transação, remoção lógica de documento e tratamento do elenco de revezamento. Categorias de equipe continuam acumulando seus limites explícitos.
- Arquivar atleta não arquiva seu papel de profissional nem a identidade compartilhada. Vínculo encerrado por transferência exige análise; cadastro em inscrição enviada/aprovada exige correção antes de editar/arquivar. Alterações concorrentes de identidade/vínculo são recusadas.
- Validação: 55 testes JS, build, seis suítes SQL e três cenários com conexões concorrentes; Chromium cobriu painel completo, escola, atleta/profissional com a mesma identidade, cadastro na edição, arquivo, inscrição, envio, aprovação, relatórios/notificações, recarga e permissões/móvel. HTTP do Supabase no teste de navegador é simulado; SQL/RLS são verificados no Supabase real com rollback.
- Nenhum dado local foi apagado ou importado automaticamente. Os registros de exemplo/localStorage pertencem à demonstração; o banco mostra os registros reais. As contagens anteriores do banco foram preservadas e os fixtures foram desfeitos.
- Continuam fora desta entrega: importação explícita dos navegadores, worker de e-mail, competições/resultados e inscrições públicas. Não redesenhar nem esconder as telas existentes numa próxima etapa.

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
