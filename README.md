# CircuitoNE QA

Este repositório controla o verificador e a suíte de aceite do [CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE). O App de implementação `ignisdevne` não deve ter acesso a este repositório.

- `main` contém o workflow, os scripts e as dependências do verificador.
- `accepted` contém a suíte ativa em `tests/e2e/` e o estado em `.qa/state.json`.
- `proposals/source-pr-N` contém apenas mudanças de testes para o PR `N` da aplicação. O workflow prepara a branch e abre o PR com o App de QA; o responsável aprova o SHA exato antes do aceite. O token padrão do Actions não cria PRs nesta organização.

O workflow `Canonical acceptance` recebe uma execução concluída do CI da aplicação, valida sua origem e executa a suíte aprovada contra o container candidato sem entregar segredos ao código candidato. Um GitHub App de QA separado publica o check `canonical-acceptance` no SHA da aplicação. Após merge e nova validação do commit integrado, o workflow promove a suíte revisada para `accepted`.

Uma falha ao resolver uma execução de CI vinculada a uma PR aberta também publica `canonical-acceptance: failure`, com link para o log do QA. Solicitações que não possam ser vinculadas com segurança a uma PR exata não publicam check; a ausência do check continua bloqueando o merge. Se uma PR for testada antes da promoção da `main` anterior terminar, repita o aceite após a promoção.

O QA é privado e o App implementador não está instalado nele. O plano GitHub atual não oferece proteção de branches para repositórios privados (HTTP 403). Por isso, o estado em `accepted` registra a árvore Git dos testes: um merge acidental que altere só os testes faz o aceite falhar. Esse registro detecta desvios acidentais; não substitui revisão independente nem impede um administrador com escrita de alterar estado e testes juntos. A [issue #31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) acompanha essa limitação e a retirada das credenciais humanas do ambiente implementador.

O check `canonical-acceptance` já é obrigatório para integrar PRs no CircuitoNE. Quando uma PR propõe novos testes, o responsável aprova a proposta QA no SHA exato; o gatilho em `accepted` confere a revisão, o PR de origem e o último CI e dispara o aceite canônico. O job não executa código da proposta e usa os scripts de `main`. Após o merge da aplicação, a promoção bem-sucedida fecha somente a proposta registrada no estado promovido; uma falha mantém a proposta aberta. O workflow diário remove branches temporárias de PRs QA fechadas. O [controle de mudanças](https://github.com/IgnisDevNE/CircuitoNE/blob/main/docs/controls/change-control.md) reúne o procedimento e as pendências [#31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) e [#58](https://github.com/IgnisDevNE/CircuitoNE/issues/58).
