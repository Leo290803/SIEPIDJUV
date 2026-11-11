# SIEP — Sistema de Inscrições em Eventos e Projetos

Primeira versão navegável em React e Vite, em português, com layout responsivo.

Para continuar o trabalho em outro chat, leia [CONTINUIDADE.md](CONTINUIDADE.md): decisões do produto, estado implementado, pendências e próximos passos do Supabase.

## Executar

Requer Node.js 22 ou superior e npm.

```sh
npm ci
npm run dev
```

Para testar as regras de participação: `npm test`.

Para gerar os arquivos de produção: `npm run build`. Para verificar essa versão localmente: `npm run preview`.

Use o checkout existente. Não é necessário criar um worktree.

## Funcionalidades desta versão

- Interface administrativa com cabeçalho azul, tabelas de eventos, busca, filtros e paginação.
- Navegação simplificada: seletor único de área, escola no menu lateral e evento em uma linha de contexto.
- Cadastros com uma única barra de ações e filtros, sem cartões repetindo o título da página.
- Ajuda e exemplos em Como funciona, recolhidos por padrão.
- Configurações centralizadas nas abas de Gerenciar evento, sempre vinculadas ao evento aberto na lista.
- Indicadores da secretaria calculados a partir dos cadastros locais.
- Áreas de demonstração separadas para secretaria e escola, com menus e ações próprios.
- Seletor de escola para visualizar atletas e rascunhos específicos de cada escola.
- Evento ativo persistido por escola: escolha uma vez e use Trocar evento quando necessário. O contexto é reutilizado nos cadastros e inscrições.
- Cadastro do atleta em uma tela com dados configuráveis, seleção de modalidades/categorias e documentos por edição.
- Nome completo, data de nascimento, CPF válido e sexo são obrigatórios em todos os cadastros de pessoas (atletas, responsáveis e comissão técnica), inclusive rascunhos de novos cadastros.
- Gerenciar evento → Formulário e documentos: os quatro campos fixos não podem ser ocultados ou dispensados; os demais dados e anexos são opcionais, obrigatórios ou não solicitados conforme a pré-configuração.
- Arquivos reais armazenados em IndexedDB no navegador, com upload/download e limite de 5 MB por documento (PDF, PNG ou JPEG).
- Dados pessoais reutilizáveis e participações/documentos separados por evento. Cadastros completos são reavaliados quando surgem novas exigências.
- Rascunho de cadastro permite pendências de modalidade e documentos, mas exige os quatro dados pessoais fixos. Concluir cadastro verifica exigências e regras gerais de participação; não envia inscrição nem ocupa vaga em prova.
- Portal escolar com eventos abertos, dados da escola e prévia de inscrição com seleção de atletas.
- Menu lateral com um único item Eventos. Na lista, Gerenciar abre uma página própria do evento com abas: Visão geral, Modalidades e categorias, Regras e limites, Formulário e documentos e Funções.
- Evento fixo dentro do gerenciamento, sem seletor duplicado. Alternar abas preserva o preenchimento em andamento; cada seção é salva pelo seu próprio botão.
- Modalidades organizadas em lista com busca e paginação; crie cada esporte uma vez e abra Configurar para gerenciar suas categorias.
- Nome e classificação configurados na modalidade e compartilhados pelas categorias.
- Categorias em tabela paginada, com edição individual em janela; cada prova é selecionada para edição sem empilhar formulários. Cada alteração é salva na própria modalidade ou categoria.
- Categorias anteriores agrupadas automaticamente, preservando identificadores, anos, provas, regras e participações.
- Cadastro de categorias com participação, limites de atletas e provas individuais ou revezamentos.
- Ano inicial e final de nascimento configuráveis por categoria, com extremos inclusivos. O formulário filtra as modalidades/categorias conforme a data do atleta; o nome da categoria não define o intervalo.
- Data obrigatória em todos os cadastros; mudança de nascimento retira seleções incompatíveis com aviso. Faixas novas reavaliam cadastros completos e inscrições. Categorias antigas sem intervalo permanecem sem restrição até serem configuradas.
- Catálogo completo de oito regras, sempre visível, com local de aplicação selecionado na configuração, prévia, engrenagem, ativação e remoção.
- Regras adicionais: categorias por atleta no mesmo esporte, atletas por inscrição, inscrições por escola, faixa etária e comissão técnica por inscrição.
- Idade calculada por data de referência configurável; nascimento ausente ou inválido gera pendência. Regras específicas de prova só se aplicam quando a prova é selecionada.
- Orientações na própria interface: passo a passo, exemplo completo, definições dos campos, resumo de regras em linguagem comum e atalhos por categoria.
- Limites de modalidades gerais, individuais e coletivas por atleta; limites de provas individuais e revezamentos por categoria.
- Regras gerais e específicas se acumulam, sem etapas; revezamento não consome uma modalidade coletiva.
- Pendências de participação visíveis durante a seleção e nos rascunhos. Rascunhos conflitantes podem ser salvos para correção.
- Seleção de funções da comissão técnica permitidas por evento.
- Rascunhos por participação individual ou coletiva, com seleção de categoria, atletas e comissão técnica. A escola representante é identificada automaticamente nos dois casos; não há nome de equipe manual.
- Validação dos limites de integrantes e idade, quando as regras correspondentes estiverem ativas. O envio para análise permanece fora desta etapa; documentos são locais e não enviados à secretaria.
- Rascunhos antigos são preservados e podem receber categoria ao serem editados.
- Cadastro de comissão técnica por escola, com função, registro profissional informativo e contatos.
- Busca, filtros, edição, arquivamento e reativação de profissionais; seleção dos ativos nos rascunhos escolares.
- Eventos de exemplo e criação de eventos em rascunho.
- Duplicação pela lista de eventos: nome e edição próprios, novas datas opcionais, cópia de modalidades, categorias, provas, regras, formulário, exigências de documentos e funções.
- Cópias começam em rascunho, com contadores zerados e identificadores independentes; não copiam atletas, inscrições ou arquivos enviados. Revise anos de nascimento e datas de referência de idade para cada nova edição.
- Configuração dos dados adicionais e anexos na aba Formulário e documentos de Gerenciar evento.
- Persistência dos eventos em localStorage, por navegador.
- Busca de eventos e exportação de resumo em CSV.
- Cadastro de escolas com nome, INEP, município, endereço e contatos.
- Edição, busca sem acentos, arquivamento e reativação de escolas.
- Verificação de INEP duplicado e persistência local dos cadastros.
- Cadastro de atletas por escola, com edição, busca, filtros, arquivamento e reativação.
- CPF obrigatório, com validação e bloqueio de duplicidade, inclusive em cadastros arquivados.
- Cadastro local de responsáveis com seleção de escola ativa, cargo e contatos.
- Aprovação, recusa, encerramento e reabertura de vínculos, com justificativa e histórico.
- Busca e filtros de responsáveis; solicitações pendentes integradas ao painel inicial.
- Abas Competições e Inscrições públicas com indicação “Em breve”.

## Limites atuais

Este é um protótipo funcional de interface, sem backend. Os cadastros iniciais de eventos, escolas e responsáveis são exemplos. Os indicadores usam os registros locais, sem representar inscrições reais enviadas. A seleção de área serve para demonstração e não aplica controle de acesso. Os filtros de escola são apenas de interface, sem isolamento de segurança; todos os dados permanecem no mesmo navegador. Cadastros e decisões de vínculo dos responsáveis são persistidos neste navegador e não concedem acesso real. Não inserir dados pessoais reais.

Autenticação por CPF, recuperação de acesso, separação segura entre instituições, armazenamento online dos cadastros/documentos, envio de inscrições, análise e notificações ainda serão implementados no servidor. Eventos salvos no navegador não são publicados.

A interface utiliza fontes locais do sistema operacional. O logotipo oficial fornecido no repositório é exibido no menu lateral, preservando o arquivo original.

## Configurar regras de participação

Na área Secretaria, abra Eventos, clique em Gerenciar no evento desejado e abra Modalidades e categorias. Cadastre as categorias e suas provas. Na aba Regras e limites, o catálogo exibe todas as regras. Clique em Adicionar e configurar na regra desejada, escolha a categoria e a prova quando necessário, informe os limites e salve. Os filtros da página alteram apenas a lista de regras salvas. Não ocultam o catálogo. Vazio significa sem limite; zero impede aquele tipo de participação. As regras começam a valer após salvar e são reavaliadas ao abrir os rascunhos.

Exemplo: evento com total 2, individuais 1 e coletivas 1; categoria de atletismo com provas individuais 2 e revezamentos 1. O atleta pode selecionar 100 m, salto, revezamento e também futsal. Badminton junto do atletismo gera pendência. Não há isolamento de segurança, envio definitivo ou aprovação de inscrições nesta versão local.

## Evento ativo e cadastro do atleta

Na área Escola, escolha Trabalhar neste evento uma vez. O topo indica o evento ativo, mantido ao navegar e recarregar. Em Atletas, cadastre ou edite um atleta para preencher a participação dessa edição, incluindo modalidades e anexos. Documentos não são reutilizados automaticamente entre edições. Use Trocar evento para trabalhar em outra edição. Ao montar inscrições, somente atletas com cadastro completo e participação na categoria escolhida ficam disponíveis. Cadastros anteriores sem participação por evento são preservados e precisam ser revisados.

Os anexos ficam em IndexedDB e seus metadados em localStorage; limpar os dados do site remove esses arquivos. Uploads ainda não são enviados a nenhum servidor. A publicação da aplicação não transforma o armazenamento local em compartilhado.

Cadastros antigos não são apagados quando faltar um dado obrigatório. Revise-os antes de utilizar em novas inscrições. Responsáveis podem ser editados para completar os dados e só podem receber aprovação com os quatro dados válidos. Profissionais incompletos são identificados e precisam ser corrigidos antes de serem selecionados em uma inscrição.

## Estrutura Supabase

A primeira migração do banco foi aplicada e verificada. Modelo, executor, testes, segurança e pendências: [supabase/README.md](supabase/README.md). A interface permanece em demonstração local, sem integração com o banco nesta etapa.
