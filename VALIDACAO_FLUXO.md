# Validação do fluxo escolar — 18/11/2026

O fluxo disponível passou após corrigir uma inconsistência na liberação de crachás da comissão técnica. A validação combinou Chromium sobre o build de produção com API simulada, PostgreSQL local descartável e asserções SQL no Supabase real. **Não é um teste HTTP ponta a ponta do site publicado**: o proxy deste ambiente recusou o acesso a `siepidjuv.vercel.app` e ao domínio do projeto Supabase com HTTP 403. Auth/Storage foram simulados no navegador; regras, transações e permissões foram executadas em PostgreSQL real. Nenhuma conta ou inscrição de teste foi criada de forma persistente no banco real.

## Inconsistência encontrada e corrigida

A inscrição aprovada dos atletas liberava a comissão técnica para emissão de crachá mesmo sem a conferência independente do profissional. O novo teste SQL reproduziu a falha com a mensagem **Comissão sem conferência própria liberou crachá**.

A migração `20261118210000_badge_staff_approval` passa a exigir conferência técnica **aprovada e atual** para novas emissões de profissionais. Pendente, correção solicitada, indeferido ou cadastro/foto/funções alterados após a análise não liberam nova emissão. A lista paginada, o endpoint anterior de candidatos e a emissão direta usam a mesma regra; esconder a pessoa na interface não é a única proteção. O vínculo com inscrição aprovada continua obrigatório. Atletas e responsáveis mantêm suas regras anteriores. Emissões, fotos históricas, versões e reimpressão permanecem preservadas; nenhum crachá existente é apagado ou alterado.

## Resultado por etapa

| Etapa | Resultado e evidência |
| --- | --- |
| Acesso da escola | Navegador testa geração pela Secretaria, login com CPF, entrada na escola autorizada, recusa de rotas indevidas e expiração da sessão. API simulada. SQL executa RLS e permissões reais. |
| Cadastro, foto e documentos | Navegador reutiliza identidade, substitui foto, envia anexo PNG válido, exibe a prévia do documento privado e verifica responsável legal quando necessário. SQL valida exigências e limites. |
| Concluir inscrição | Navegador valida pendências, preserva valores, distingue rascunho e conclui sem botão separado de envio. Testa resposta perdida após gravar e repetição sem duplicar inscrição/avisos. SQL confirma transação, idempotência e limites de acesso. |
| Correção e reenvio | Secretaria informa orientação/prazo; escola abre o anexo indicado, salva sem reenviar quando necessário e usa Salvar correções e reenviar. Testes verificam pendências, prazo vencido e resposta perdida na rede. |
| Aprovação da inscrição | Só a Secretaria aprova. SQL recusa autoaprovação pela escola. A aprovação não aprova automaticamente o profissional. |
| Comissão técnica | Um registro por pessoa/evento/escola, sem repetir por modalidade. Histórico e revisão esperada; escola consulta, mas não decide. Alterar dados/foto exige nova análise. |
| Liberação de crachás | SQL verifica atleta de inscrição aprovada e profissional com análise própria aprovada e atual. Pendência, correção e indeferimento técnicos bloqueiam lista e emissão direta. Outro evento/escola não libera crachá. |
| Dados e fotos por perfil | SQL usa pessoas e fotos distintas e confere nome, evento, escola, papel e ID da foto nos snapshots. Navegador emite um lote com atleta e técnico e verifica os pixels de imagens marcadoras diferentes, detectando troca de fotos entre perfis. |
| Histórico e reimpressão | Reimprimir não cria emissão. Trocar a foto técnica não altera o snapshot antigo, bloqueia nova emissão até revisão e produz versão 2 com a foto nova após aprovação. |
| PDF de crachás | Lote de dois perfis em uma página A4; teste adicional com cinco crachás e nomes longos gera duas páginas A4 sem cortes. A impressora física não é acionada. |
| Relatórios | Navegador testa filtros de evento/escola/sexo/categoria, agrupamentos, busca sem resultado e exportações PDF/CSV; SQL testa consulta paginada e escopo. |
| Notificações e celular | Navegador testa escola/Secretaria, contador/leitura, destino da inscrição, recuperação de erro e layout em 390px. |

## Verificações executadas

- `npm test`: **110 testes aprovados**.
- `npm run build`: aprovado.
- `npm run test:database`: **18 suítes SQL e 3 cenários de concorrência**, aprovados.
- `SIEP_TEST_ORIGIN=http://localhost:4173 npm run test:browser`: aprovado, API simulada.
- `SIEP_TEST_ORIGIN=http://localhost:4173 npm run test:access-browser`: aprovado, API simulada.
- `npm run test:badge-print`: cinco crachás, zero cortes, duas páginas A4.
- Validação e aplicação da migração no Supabase: asserções SQL aprovadas, fixtures descartados.

## Artefatos desta execução

- `/tmp/siep-roundtrip-athlete-staff-badges.pdf`: dois perfis, nomes/escola/evento corretos. As imagens preta/vermelha são **marcadores de teste**, não retratos ou dados reais.
- `/tmp/siep-roundtrip-athlete-staff-badges.png`: prévia do mesmo lote.
- `/tmp/siep-badges-pagination-test.pdf`: cinco crachás em duas páginas A4, incluindo nomes longos.
- `/tmp/siep-relatorio.pdf`: relatório exportado pelo fluxo de navegador.

As regras do banco foram verificadas com dados temporários. A conferência de uma sessão real no site publicado e de downloads reais pelo HTTP do Storage continua pendente por causa do bloqueio de rede descrito acima.
