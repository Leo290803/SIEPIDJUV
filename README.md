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

- Painel da instituição com indicadores demonstrativos.
- Eventos de exemplo e criação de eventos em rascunho.
- Seleção dos dados solicitados aos atletas durante a criação do evento.
- Persistência dos eventos em localStorage, por navegador.
- Busca de eventos e exportação de resumo em CSV.
- Cadastro de escolas com nome, INEP, município, endereço e contatos.
- Edição, busca sem acentos, arquivamento e reativação de escolas.
- Verificação de INEP duplicado e persistência local dos cadastros.
- Cadastro local de responsáveis com seleção de escola ativa, cargo e contatos.
- Aprovação, recusa, encerramento e reabertura de vínculos, com justificativa e histórico.
- Busca e filtros de responsáveis; solicitações pendentes integradas ao painel inicial.
- Abas Competições e Inscrições públicas com indicação “Em breve”.

## Limites atuais

Este é um protótipo funcional de interface, sem backend. Os indicadores e cadastros iniciais são exemplos, não métricas calculadas de inscrições reais. A seleção de perfil serve para demonstração e não aplica controle de acesso. Cadastros e decisões de vínculo dos responsáveis são persistidos neste navegador e não concedem acesso real. Não inserir dados pessoais reais.

Autenticação por CPF, recuperação de acesso, separação segura entre instituições, cadastro de atletas, documentos, inscrições, análise e notificações ainda serão implementados no servidor. Eventos salvos no navegador não são publicados.

As fontes web são opcionais; há fontes locais de fallback. O logotipo exibido é uma marca provisória em texto e CSS, não a imagem oficial fornecida na conversa.
