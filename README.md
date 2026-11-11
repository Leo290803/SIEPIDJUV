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
- Indicadores da secretaria calculados a partir dos cadastros locais.
- Áreas de demonstração separadas para secretaria e escola, com menus e ações próprios.
- Seletor de escola para visualizar atletas e rascunhos específicos de cada escola.
- Portal escolar com eventos abertos, dados da escola e prévia de inscrição com seleção de atletas.
- Menu Eventos expansível: cadastro de eventos, competições das modalidades, validações e funções.
- Cadastro de categorias com classificação da modalidade, participação, limites de atletas e provas individuais ou revezamentos.
- Validações configuráveis por evento, categoria e prova, com catálogo, engrenagem de configuração, ativação e remoção.
- Orientações na própria interface: passo a passo, exemplo completo, definições dos campos, resumo de regras em linguagem comum e atalhos por categoria.
- Limites de modalidades gerais, individuais e coletivas por atleta; limites de provas individuais e revezamentos por categoria.
- Regras gerais e específicas se acumulam, sem etapas; revezamento não consome uma modalidade coletiva.
- Pendências de participação visíveis durante a seleção e nos rascunhos. Rascunhos conflitantes podem ser salvos para correção.
- Seleção de funções da comissão técnica permitidas por evento.
- Rascunhos por participação individual ou coletiva, com seleção de categoria, atletas e comissão técnica. A escola representante é identificada automaticamente nos dois casos; não há nome de equipe manual.
- Validação dos limites de integrantes; idade, documentos, elegibilidade e envio para análise permanecem fora desta etapa.
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

Autenticação por CPF, recuperação de acesso, separação segura entre instituições, cadastro de atletas, documentos, inscrições, análise e notificações ainda serão implementados no servidor. Eventos salvos no navegador não são publicados.

A interface utiliza fontes locais do sistema operacional. O logotipo oficial fornecido no repositório é exibido no menu lateral, preservando o arquivo original.

## Configurar regras de participação

Na área Secretaria, abra Eventos → Cadastro de competições das modalidades e selecione o evento. Cadastre as categorias e suas provas. Em Gerenciamento de validações, escolha Evento inteiro para limitar modalidades, uma categoria para limitar provas, ou uma prova específica para limitar inscrições repetidas. Clique em Adicionar e configurar, informe os limites e salve. Vazio significa sem limite; zero impede aquele tipo de participação. As regras começam a valer após salvar e são reavaliadas ao abrir os rascunhos.

Exemplo: evento com total 2, individuais 1 e coletivas 1; categoria de atletismo com provas individuais 2 e revezamentos 1. O atleta pode selecionar 100 m, salto, revezamento e também futsal. Badminton junto do atletismo gera pendência. Não há isolamento de segurança, envio definitivo ou aprovação de inscrições nesta versão local.
