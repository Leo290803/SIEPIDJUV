# Desempenho e limites — 16/11/2026

O portal passou a consultar dados por tela. Atletas, comissão técnica, responsáveis, inscrições e candidatos a crachá usam páginas de 25 registros. Filtros, totais e agrupamentos dos relatórios são calculados no PostgreSQL. A paginação do relatório limita a resposta real; não apenas as linhas desenhadas no navegador.

As buscas aguardam 350 ms sem digitação. Consultas substituídas são canceladas, respostas antigas são descartadas e leituras paginadas têm um prazo de 15 segundos no cliente. Cadastro/edição preservam as RPCs de escrita, revisão esperada, validações e autorização existentes. O painel recebe contagens, sem baixar pessoas ou inscrições. Configurações de eventos e diretório de escolas continuam sendo catálogos completos; documentos e participações são carregados somente para os registros/contexto necessários.

## Evidência local

`npm run test:scale` cria PostgreSQL 17 descartável em Docker, aplica as migrações e cria **10.000 atletas, 100 escolas e 20.000 inscrições**. Não acessa o Supabase nem usa seu token. As fixtures respeitam FKs, CPFs e gatilhos. O container é removido ao finalizar; `--keep` e `--reuse` são recursos de diagnóstico local.

Medição de uma execução, incluindo o cliente `docker exec`/`psql`, sem equivalência com o hardware do Supabase Free ou pago:

| Consulta | Tempo aproximado | Conteúdo retornado |
| --- | ---: | --- |
| Painel | 136 ms | Contagens; zero pessoas |
| Cadastro de atletas | 137 ms | Página de 25 |
| Inscrições | 136 ms | Página de 25 e respectivos elencos |
| Relatório geral de participações | 740 ms | 25 de 20.000 linhas; 10.000 pessoas distintas |
| Resumo por sexo | 632 ms | Dois grupos |
| Resumo por escola | 739 ms | Página de 25 de 100 grupos |
| Escola + sexo + categoria | 167 ms | Página filtrada |
| Candidatos a crachá | 171 ms | Página de 25 |

Quatro consultas filtradas simultâneas terminaram em aproximadamente 293 ms no total. Isso verifica uma concorrência pequena de leitura, não um pico de inscrições ou capacidade comercial garantida. Um plano genérico inicialmente excedeu o orçamento de 20 s no teste; a função privada agora usa SQL parametrizado com plano por filtros e elimina ramos de outros relatórios. O agrupamento foi convertido em agregações por conjunto.

`SIEP_TEST_ORIGIN=http://localhost:4173 npm run test:scale-browser` testa o build de produção servido por `npm run preview -- --port 4173`, com API simulada e 10.001 pessoas. Verifica DOM de 25 linhas, busca, próxima página, geração do PDF em worker, interface respondendo durante a exportação e cancelamento. O PDF de 501 páginas contém todos os 10.001 nomes e ocupa cerca de 1,36 MB com compressão. `pdftotext` foi usado para conferir os nomes distintos, inclusive o último. Isso não é teste HTTP do projeto Supabase.

## Exportação e proteção de recursos

Os arquivos são produzidos em **Web Worker no navegador**, sem executar a composição do PDF na thread da interface. As consultas chegam sequencialmente em lotes de até 500. Existe progresso, cancelamento e prazo total de 120 segundos. O worker e as requisições são encerrados ao sair da tela. Um marcador da auditoria institucional identifica alterações entre os lotes: nesse caso a exportação falha integralmente e pede atualização, em vez de baixar um resultado misturado. O marcador é conservador: alterações institucionais sem relação com o relatório também podem invalidá-lo.

Limite explícito de **20.000 linhas por arquivo**, sem truncamento silencioso. Acima disso, a tela orienta dividir por evento, escola ou categoria. O agrupamento permite exportar resumos muito menores. Não existe fila persistente de exportações no servidor nesta entrega; para arquivos maiores ou geração que precise continuar após fechar o navegador, o próximo mecanismo é uma fila com worker de servidor e armazenamento privado.

Os índices novos cobrem inscrições por data, elencos por inscrição, vínculos por papel/escola, participações por pessoa/escola e auditoria por instituição/data. Foram adicionados por migrações, sem remover índices, histórico ou dados existentes.

## Antes da abertura pública

O plano Free comporta desenvolvimento e testes controlados, mas possui limites de CPU, armazenamento, tráfego e conexões. Fotos/anexos e histórico de auditoria também consomem armazenamento; otimizar consultas não amplia essas cotas. Não houve teste de carga no Supabase Free nem troca de plano.

Antes da operação real, conferir as cotas e o dimensionamento do projeto, medir o fluxo completo de envio/aprovação com acessos simultâneos no ambiente previsto para produção e acompanhar consultas lentas, erros/tempos de espera, CPU, armazenamento e tráfego. O banco já mantém as garantias concorrentes de vagas, provas e revisões. Não é possível prometer ausência absoluta de lentidão ou indisponibilidade apenas com estes testes locais.
