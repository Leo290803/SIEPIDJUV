# Validação do fluxo escolar — 16/11/2026

O fluxo passou nas verificações disponíveis: Chromium sobre o build de produção com API simulada, PostgreSQL local descartável e 13 suítes SQL no Supabase real com rollback. Esta rodada não encontrou falha de produto. Os exemplos existentes não foram modificados e nenhuma conta real foi criada.

| Etapa | Evidência |
| --- | --- |
| Secretaria gera acesso | Navegador: gera acesso do responsável sem e-mail e mostra as credenciais previstas. |
| Responsável entra com CPF | Navegador: login pelo endpoint simulado de CPF e entrada direta na área escolar; sem cadastro público e sem exigir troca de senha. |
| Escola acessa somente seu escopo | Interface recusa rotas da Secretaria e escola não autorizada; SQL real verifica RLS e recusa leitura/gravação em escola existente de outro escopo. |
| Cadastro no evento e foto | Navegador: identidade reutilizada, foto escolhida/substituída, anexo privado e participação concluída no evento. SQL verifica os requisitos de cadastro/documentos e os limites esportivos. |
| Escola cria e envia inscrição | Navegador executa a operação sob perfil escolar. SQL confirma envio e impede autoaprovação/edição de inscrição enviada. |
| Secretaria solicita correção | Navegador informa justificativa e prazo futuro; inscrição aparece para a escola como Correção solicitada. |
| Escola edita e reenvia | Navegador abre Continuar, salva e reenvia; a escola não tem botão Aprovar. SQL salva a revisão corrigida com comissão técnica, reenvia e mantém o histórico. |
| Secretaria aprova | Navegador e SQL confirmam a transição. No SQL, a aprovação chega à revisão 6 e o snapshot preserva a comissão corrigida. |
| Detalhes/histórico | Navegador abre, exibe participante/decisão, recarrega a URL e fecha; sem o antigo erro de referência a `all`. |
| Crachá | Navegador emite, carrega imagem, abre a prévia e reimprime sem criar outra emissão. PDF do crachá gerado em Chromium; sem acionar impressora física. |
| Relatório | Navegador filtra evento/escola/sexo/categoria, baixa PDF/CSV e testa agrupamentos. PDF foi inspecionado para nome, escola, situação e filtros. |

## Comandos

Com o build servido por `npm run preview -- --port 4173`:

```sh
SIEP_TEST_ORIGIN=http://localhost:4173 npm run test:access-browser
SIEP_TEST_ORIGIN=http://localhost:4173 npm run test:browser
npm run test:database
```

A validação remota foi executada com `scripts/supabase_migrate.py` no modo padrão, sem `--apply`: **zero migrações pendentes**, todas as asserções SQL passaram e a transação foi desfeita. Os fixtures SQL também se desfazem internamente. A sequência de transições escola → Secretaria → escola → Secretaria virou uma asserção permanente no teste conectado.

Artefatos temporários desta execução: `/tmp/siep-roundtrip-badge.pdf`, `/tmp/siep-relatorio.pdf` e `/tmp/siep-badge-preview.png`. Não contêm dados dos cadastros reais do usuário.

## Limite da validação

O executor continua recebendo 403 do proxy ao conectar ao domínio `oshzcmmbhxvmchjgxztp.supabase.co`, inclusive no endpoint de saúde do Auth. Por isso **não foi validado o login/upload HTTP real de ponta a ponta**. O acesso SQL pela Management API funciona; ele comprova regras e permissões do banco, mas não substitui a autenticação HTTP, a implantação das Edge Functions ou a transferência real de arquivos no site publicado. O teste de navegador usa respostas simuladas nesses serviços. Esse bloqueio é do ambiente de teste e não demonstra uma falha de acesso no navegador do usuário.
