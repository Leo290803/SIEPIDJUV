# Revisão de alinhamento do SIEP

Revisão das telas conectadas da Secretaria e da Escola em 1440, 1024 e 390 pixels, usando Chromium e dados de teste. Nenhuma gravação em dados reais do Supabase.

## Correções

- A grade global dos `fieldset` fazia o conteúdo das abas de evento ocupar cerca de metade da largura. Os blocos estruturais agora ocupam toda a área; somente grupos de opções usam a grade explícita `selection-grid`.
- Formulários de criar/editar evento e de inscrição agora têm campos e ações em linhas próprias. Os agrupamentos de edição/tipo, datas e identidade permanecem organizados e se empilham no celular.
- Instituição, usuários da Secretaria e decisões de vínculo têm rótulos acima dos campos, entradas com largura consistente e ações separadas do conteúdo.
- Controles em uma mesma linha se alinham pela base, inclusive quando um rótulo ocupa duas linhas. Campos de vagas/mínimo de atletas da prova se empilham no celular.
- Barras de ações, botões, cabeçalho e janelas acomodam telas estreitas. Tabelas e abas extensas mantêm rolagem interna.

## Cobertura

| Área | Telas e estados |
| --- | --- |
| Secretaria | Painel, Eventos, Escolas, Responsáveis, Atletas, Comissão técnica, Inscrições, Relatórios, Notificações, Instituição, Usuários e módulos Em breve |
| Gerenciar evento | Visão geral, Modalidades e categorias, Regras e limites, Formulário e documentos, Funções |
| Formulários administrativos | Escola, responsável, atleta, profissional, criar/editar/duplicar evento, modalidade, categoria, prova e configuração de regra |
| Escola | Painel, Eventos disponíveis, Atletas, Comissão técnica, Inscrições, Notificações e Dados da escola |
| Fluxos escolares | Edição da participação/arquivo, profissional, inscrição nova/edição/histórico e seleção do elenco |

A comparação inicial reuniu 108 capturas e identificou duas telas com transbordamento horizontal, além dos problemas de grade/alinhamento. A revisão corrigida cobre os mesmos estados e as janelas internas, incluindo o final dos formulários longos. As medições verificam largura do documento, controles fora dos limites, largura das abas, alinhamento de pares de campos e acesso aos botões no fim das janelas.

O teste funcional também percorre cadastro, arquivo, inscrição, envio, aprovação, recarga e restrições de acesso. O HTTP do Supabase é simulado nesses testes de navegador; esta revisão não altera regras ou migrações do banco.

## Reproduzir

Com `npm run dev` ativo:

```sh
SIEP_LAYOUT_AUDIT=after npm run test:browser
SIEP_LAYOUT_AUDIT=details npm run test:browser
npm test
npm run build
```

Capturas e relatórios JSON ficam em `/tmp/siep-layout-audit/after` e `/tmp/siep-layout-audit/details`. A fase `after` percorre telas principais e formulários; `details` percorre janelas internas e seus rodapés. As fases verificadas falham se encontram transbordamento, campos fora dos limites ou problemas de alinhamento medidos. Arquivos locais antigos e dados de produção são preservados.
