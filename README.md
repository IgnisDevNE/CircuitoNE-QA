# CircuitoNE QA

Este repositório controla o verificador e a suíte de aceite do [CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE). O App de implementação `ignisdevne` não deve ter acesso a este repositório.

- `main` contém o workflow, os scripts e as dependências do verificador.
- `accepted` contém a suíte ativa em `tests/e2e/` e `tests/database/`, com as duas árvores registradas em `.qa/state.json` (versão 2).
- `proposals/source-pr-N` contém apenas mudanças de testes para o PR `N` da aplicação. O workflow prepara a branch e abre o PR com o App de QA; o responsável aprova o SHA exato antes do aceite. O token padrão do Actions não cria PRs nesta organização.

O workflow `Canonical acceptance` recebe uma execução concluída do CI da aplicação, valida sua origem e executa a suíte aprovada contra o container candidato sem entregar segredos ao código candidato. Um GitHub App de QA separado publica o check `canonical-acceptance` no SHA da aplicação. Após merge e nova validação do commit integrado, o workflow promove a suíte revisada para `accepted`.

Uma falha ao resolver uma execução de CI vinculada a uma PR aberta também publica `canonical-acceptance: failure`, com link para o log do QA. Solicitações que não possam ser vinculadas com segurança a uma PR exata não publicam check; a ausência do check continua bloqueando o merge. Se uma PR for testada antes da promoção da `main` anterior terminar, repita o aceite após a promoção.

O QA é público desde 24/09/2026. O App implementador continua excluído da instalação. Os rulesets protegem `main` (PR, CI, revisão independente após o último push, sem bypass) e `accepted` (escrita somente pelo App Promoter); ambos bloqueiam exclusão e force push. O estado registra as árvores para detectar alterações fora da promoção. A [issue #31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) acompanha as negativas restantes e a retirada das credenciais de manutenção do ambiente implementador.

## Aceite independente de banco

Postgres 17.6.1.167 e Auth v2.196.0 usam o repositório oficial `supabase` no Docker Hub, com manifestos fixados independentemente pelo QA. Em 27/09/2026, o ECR recusou downloads por limite de dados; a mudança de registro preservou os IDs de configuração das imagens Linux/amd64 já conferidas (`660892…0191f` e `688edb…c2f6`). Os digests de manifesto diferem entre registros; não alegar igualdade desses digests. Oráculos, isolamento e comando de execução permanecem iguais.

O runner aprovado em `main` (W) lê somente os blobs SQL das migrações e seeds do commit candidato (C). Oráculos SQL, fixtures e módulos de concorrência vêm da proposta aprovada (Q); o harness local `migrations.test.mjs` não é executado nem promovido. Configuração, dependências, imagens e comando de execução pertencem a W. Nenhum script, pacote ou instalação de dependências de C controla esse job.

O PostgreSQL 17 e as migrações oficiais do Auth iniciam antes de qualquer SQL candidato. O banco usa `network none`, usuário sem privilégios, raiz somente leitura, capacidades removidas e dados descartáveis em memória. O executor Node separado compartilha apenas a rede local do banco: sem volumes do host, socket do engine, segredos ou arquivos compartilhados com o banco. O driver `pg` envia SQL pelo protocolo; metacomandos de shell não são interpretados. Os recursos e tempos são limitados e os containers são removidos também em falha. As duas reconstruções incluem RLS/grants, invariantes, quatro famílias de concorrência e seeds sintéticos idempotentes. A comparação de tipos gerados e da referência de taxonomia permanece no CI da aplicação; este gate não substitui homologação REST/Storage no Supabase-dev.

Novos arquivos de asserção `.sql` e módulos `*-concurrency.mjs` entram na proposta e são executados após aprovação. As fixtures e etapas dos seeds têm ordem explícita em W; nova etapa exige revisão do runner. Ausência de uma suíte obrigatória ou arquivo não reconhecido falha. Sucesso de navegador sem sucesso de banco, inclusive resultado cancelado/ausente, nunca publica aceite positivo.

**Transição:** o estado legado com apenas E2E serve somente como predecessor. A próxima PR da aplicação abre uma proposta com a suíte SQL completa; o mantenedor aprova seu SHA sem fazer merge. Após os dois jobs passarem e a PR principal ser aprovada/integrada, o Promoter reexecuta ambos no merge e grava `schema_version: 2`. Checks anteriores sem `scope=2` e tentativas de tratar um estado legado como já promovido são rejeitados. Não editar `accepted` diretamente para inicializar SQL.

O check `canonical-acceptance` já é obrigatório para integrar PRs no CircuitoNE. Quando uma PR propõe novos testes, o responsável aprova a proposta QA no SHA exato; o gatilho em `accepted` confere a revisão, o PR de origem e o último CI e dispara o aceite canônico. O job não executa código da proposta e usa os scripts de `main`. Após o merge da aplicação, a promoção bem-sucedida fecha somente a proposta registrada no estado promovido; uma falha mantém a proposta aberta. O workflow diário remove branches temporárias de PRs QA fechadas. O [controle de mudanças](https://github.com/IgnisDevNE/CircuitoNE/blob/main/docs/controls/change-control.md) reúne o procedimento e as pendências [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) e [#58](https://github.com/IgnisDevNE/CircuitoNE/issues/58).
