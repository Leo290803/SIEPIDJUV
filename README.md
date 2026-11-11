# SIEP — Sistema de Inscrições em Eventos e Projetos

Primeira versão navegável em React e Vite, em português, com layout responsivo.

## Executar

Requer Node.js 22 ou superior e npm.

```sh
npm ci
npm run dev
```

Para gerar os arquivos de produção: `npm run build`. Para verificar essa versão localmente: `npm run preview`.

Use o checkout existente. Não é necessário criar um worktree.

## Funcionalidades desta versão

- Interface administrativa com cabeçalho azul, tabelas de eventos, busca, filtros e paginação.
- Indicadores da secretaria calculados a partir dos cadastros locais.
- Áreas de demonstração separadas para secretaria e escola, com menus e ações próprios.
- Seletor de escola para visualizar atletas e rascunhos específicos de cada escola.
- Portal escolar com eventos abertos, dados da escola e prévia de inscrição com seleção de atletas.
- Rascunhos de inscrição locais com seleção de atletas e comissão técnica, sem envio para análise, documentos ou validação de elegibilidade.
- Cadastro de comissão técnica por escola, com função, registro profissional informativo e contatos.
- Busca, filtros, edição, arquivamento e reativação de profissionais; seleção dos ativos nos rascunhos escolares.
- Painel da instituição com indicadores demonstrativos.
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

Este é um protótipo funcional de interface, sem backend. Os indicadores e cadastros iniciais são exemplos, não métricas calculadas de inscrições reais. A seleção de área serve para demonstração e não aplica controle de acesso. Os filtros de escola são apenas de interface, sem isolamento de segurança; todos os dados permanecem no mesmo navegador. Cadastros e decisões de vínculo dos responsáveis são persistidos neste navegador e não concedem acesso real. Não inserir dados pessoais reais.

Autenticação por CPF, recuperação de acesso, separação segura entre instituições, cadastro de atletas, documentos, inscrições, análise e notificações ainda serão implementados no servidor. Eventos salvos no navegador não são publicados.

As fontes web são opcionais; há fontes locais de fallback. O logotipo oficial fornecido no repositório é exibido no menu lateral, preservando o arquivo original.
