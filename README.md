# SIEP — Sistema de Inscrições em Eventos e Projetos

Primeira versão navegável em React e Vite, em português, com layout responsivo.

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
- Configurações de modalidades e documentos centralizadas em suas telas próprias; detalhes do evento oferecem atalhos para o evento correto.
- Indicadores da secretaria calculados a partir dos cadastros locais.
- Áreas de demonstração separadas para secretaria e escola, com menus e ações próprios.
- Seletor de escola para visualizar atletas e rascunhos específicos de cada escola.
- Evento ativo persistido por escola: escolha uma vez e use Trocar evento quando necessário. O contexto é reutilizado nos cadastros e inscrições.
- Cadastro do atleta em uma tela com dados configuráveis, seleção de modalidades/categorias e documentos por edição.
- Menu Eventos → Formulário e documentos: dados não solicitados, opcionais ou obrigatórios; anexos opcionais/obrigatórios, com opção de aceitar somente imagem.
- Arquivos reais armazenados em IndexedDB no navegador, com upload/download e limite de 5 MB por documento (PDF, PNG ou JPEG).
- Dados pessoais reutilizáveis e participações/documentos separados por evento. Cadastros completos são reavaliados quando surgem novas exigências.
- Rascunho de cadastro permite pendências. Concluir cadastro verifica exigências e regras gerais de participação; não envia inscrição nem ocupa vaga em prova.
- Portal escolar com eventos abertos, dados da escola e prévia de inscrição com seleção de atletas.
- Menu Eventos expansível: cadastro de eventos, competições das modalidades, validações e funções.
- Cadastro de categorias com classificação da modalidade, participação, limites de atletas e provas individuais ou revezamentos.
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
- Seleção dos dados solicitados aos atletas durante a criação do evento.
- Persistência dos eventos em localStorage, por navegador.
- Busca de eventos e exportação de resumo em CSV.
- Cadastro de escolas com nome, INEP, município, endereço e contatos.
- Edição, busca sem acentos, arquivamento e reativação de escolas.
- Verificação de INEP duplicado e persistência local dos cadastros.
- Cadastro de atletas por escola, com edição, busca, filtros, arquivamento e reativação.
- CPF opcional com validação e bloqueio de duplicidade, inclusive em cadastros arquivados.
- Cadastro local de responsáveis com seleção de escola ativa, cargo e contatos.
- Aprovação, recusa, encerramento e reabertura de vínculos, com justificativa e histórico.
- Busca e filtros de responsáveis; solicitações pendentes integradas ao painel inicial.
- Abas Competições e Inscrições públicas com indicação “Em breve”.

## Limites atuais

Este é um protótipo funcional de interface, sem backend. Os cadastros iniciais de eventos, escolas e responsáveis são exemplos. Os indicadores usam os registros locais, sem representar inscrições reais enviadas. A seleção de área serve para demonstração e não aplica controle de acesso. Os filtros de escola são apenas de interface, sem isolamento de segurança; todos os dados permanecem no mesmo navegador. Cadastros e decisões de vínculo dos responsáveis são persistidos neste navegador e não concedem acesso real. Não inserir dados pessoais reais.

Autenticação por CPF, recuperação de acesso, separação segura entre instituições, armazenamento online dos cadastros/documentos, envio de inscrições, análise e notificações ainda serão implementados no servidor. Eventos salvos no navegador não são publicados.

A interface utiliza fontes locais do sistema operacional. O logotipo oficial fornecido no repositório é exibido no menu lateral, preservando o arquivo original.

## Configurar regras de participação

Na área Secretaria, abra Eventos → Cadastro de competições das modalidades e selecione o evento. Cadastre as categorias e suas provas. Em Gerenciamento de validações, o catálogo exibe todas as regras. Clique em Adicionar e configurar na regra desejada, escolha a categoria e a prova quando necessário, informe os limites e salve. Os filtros da página alteram apenas a lista de regras salvas. Não ocultam o catálogo. Vazio significa sem limite; zero impede aquele tipo de participação. As regras começam a valer após salvar e são reavaliadas ao abrir os rascunhos.

Exemplo: evento com total 2, individuais 1 e coletivas 1; categoria de atletismo com provas individuais 2 e revezamentos 1. O atleta pode selecionar 100 m, salto, revezamento e também futsal. Badminton junto do atletismo gera pendência. Não há isolamento de segurança, envio definitivo ou aprovação de inscrições nesta versão local.

## Evento ativo e cadastro do atleta

Na área Escola, escolha Trabalhar neste evento uma vez. O topo indica o evento ativo, mantido ao navegar e recarregar. Em Atletas, cadastre ou edite um atleta para preencher a participação dessa edição, incluindo modalidades e anexos. Documentos não são reutilizados automaticamente entre edições. Use Trocar evento para trabalhar em outra edição. Ao montar inscrições, somente atletas com cadastro completo e participação na categoria escolhida ficam disponíveis. Cadastros anteriores sem participação por evento são preservados e precisam ser revisados.

Os anexos ficam em IndexedDB e seus metadados em localStorage; limpar os dados do site remove esses arquivos. Uploads ainda não são enviados a nenhum servidor. A publicação da aplicação não transforma o armazenamento local em compartilhado.
