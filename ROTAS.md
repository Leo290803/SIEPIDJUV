# Rotas e permissões do SIEP

> **Atualização:** a senha gerada permite entrada direta, sem troca obrigatória no primeiro acesso. Migração `20261112180000_remove_required_initial_password_change`: 17 migrações. Senhas existentes preservadas.

O registro central fica em `src/routing/routes.js`. IDs nas URLs nunca concedem autorização: o cliente consulta `siep_my_access`, e o banco aplica RLS/RPC em cada operação.

## Entradas e sessão

| Caminho | Comportamento |
| --- | --- |
| `/`, `/entrar` | Entrada geral; sessão válida segue ao primeiro vínculo autorizado |
| `/secretaria/entrar`, `/escola/entrar` | Endereços antigos; redirecionam ao login único `/entrar` |
| `/cadastro`, `/secretaria/cadastro`, `/escola/cadastro` | Cadastro público encerrado; redireciona ao login |
| `/recuperar-senha`, `/redefinir-senha` | Recuperação e definição da nova senha |
| `/acesso-pendente` | Orientação para procurar a Secretaria; não permite solicitar vínculo |
| `/acesso-negado` | Acesso recusado |
| `/demonstracao` | Demonstração local explícita |

Rotas privadas sem sessão encaminham ao login correspondente, preservando somente retorno interno registrado. Sessão expirada exige novo login. URLs desconhecidas exibem 404. Os aliases `/secretaria`, `/escola` e suas raízes por instituição encaminham ao painel autorizado. Recuperação mantém os callbacks já configurados no Auth.

## Portais

`T` representa instituição e `E` escola.

| Base | Permissão |
| --- | --- |
| `/secretaria/T` | Associação institucional aprovada: admin ou manager |
| `/escola/T/escolas/E` | Responsável aprovado, pessoa e escola ativas, vínculo não arquivado |
| `/secretaria/T/escolas/E/acompanhamento` | Secretaria acompanhando escola de sua própria instituição |

Na Secretaria, os sufixos são `painel`, `eventos`, `escolas`, `responsaveis`, `atletas`, `comissao-tecnica`, `inscricoes`, `relatorios`, `notificacoes`, `instituicao`, `usuarios`, `competicoes` e `inscricoes-publicas`. **Instituição e usuários exigem admin**; os dois últimos continuam Em breve.

Na Escola e no acompanhamento, os sufixos são `painel`, `eventos`, `atletas`, `comissao-tecnica`, `inscricoes`, `notificacoes` e `dados`. A escola só consulta e altera recursos autorizados no próprio escopo. A Secretaria continua identificada como Secretaria ao acompanhar uma escola. Não existe troca de papel pelo seletor visual.

## Recursos

- Secretaria: `eventos/novo`, `eventos/ID/editar`, `eventos/ID/duplicar` e `eventos/ID/{visao-geral,modalidades,regras,formulario,funcoes}`.
- Pessoas: `atletas/novo`, `atletas/ID/editar`, `comissao-tecnica/novo`, `comissao-tecnica/ID/editar` nas três bases. `responsaveis/novo` e `responsaveis/ID/editar` são exclusivos da Secretaria.
- Inscrições: `inscricoes/ID/editar` e `inscricoes/ID/historico` nas três bases; `inscricoes/nova` na Escola/acompanhamento.
- IDs inexistentes ou fora do escopo não abrem o formulário. Modais de confirmação de ações são transitórios, sem URL própria.

## Administração

`Usuários da Secretaria` usa `siep_staff_accounts` e `siep_set_staff_account`, exclusivos de admin. A conta de destino deve existir no Auth com e-mail confirmado. Manager não pode promover usuários nem alterar a instituição. O último administrador aprovado não pode ser removido.

Metadados editáveis do Auth não concedem papel. A revogação é aplicada no servidor na próxima operação; o frontend atualiza a navegação ao recuperar foco ou após até um minuto. Erro na consulta de acesso bloqueia o portal e oferece nova tentativa. Nenhuma chave administrativa faz parte do cliente.

## Credenciais escolares geradas pela Secretaria

Cadastro/CPF/nascimento/escola são conferidos em Responsáveis. **Gerar acesso** cria a conta sem e-mail: usuário CPF e senha inicial ano + últimos quatro dígitos. O primeiro login por CPF é encaminhado a `/redefinir-senha?primeiro=1`; o banco bloqueia os dados da escola até a troca. Login por e-mail de contas anteriores continua válido. Recuperação por CPF exige atendimento da Secretaria.

A tela de login não oferece seleção de área. A entrada comum identifica os vínculos do banco e abre o portal autorizado, sem conceder direitos pela URL.
