# CircuitoNE QA

Este repositório controla o verificador e a suíte de aceite do [CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE). O App de implementação `ignisdevne` não deve ter acesso a este repositório.

- `main` contém o workflow, os scripts e as dependências do verificador.
- `accepted` contém a suíte ativa em `tests/e2e/` e o estado em `.qa/state.json`.
- `proposals/source-pr-N` contém apenas mudanças de testes para o PR `N` da aplicação. O workflow prepara a branch; o responsável abre o PR no QA e aprova o SHA exato antes do aceite. A política da organização proíbe que o token padrão do Actions crie o PR.

O workflow `Canonical acceptance` recebe uma execução concluída do CI da aplicação, valida sua origem e executa a suíte aprovada contra o container candidato sem entregar segredos ao código candidato. Um GitHub App de QA separado publica o check `canonical-acceptance` no SHA da aplicação. Após merge e nova validação do commit integrado, o workflow promove a suíte revisada para `accepted`.

O check só se torna obrigatório depois da configuração do App de QA, dos environments e da proteção de `main` nos dois repositórios, além dos ensaios positivos e negativos da [issue #31](https://github.com/IgnisDevNE/CircuitoNE/issues/31). Antes disso, este repositório é uma preparação, não um gate ativo.
