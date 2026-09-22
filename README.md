# CircuitoNE QA

Este repositório controla o verificador e a suíte de aceite do [CircuitoNE](https://github.com/IgnisDevNE/CircuitoNE). O App de implementação `ignisdevne` não deve ter acesso a este repositório.

- `main` contém o workflow, os scripts e as dependências do verificador.
- `accepted` contém a suíte ativa em `tests/e2e/` e o estado em `.qa/state.json`.
- `proposals/source-pr-N` contém apenas mudanças de testes para o PR `N` da aplicação. O workflow prepara a branch e abre o PR com o App de QA; o responsável aprova o SHA exato antes do aceite. O token padrão do Actions não cria PRs nesta organização.

O workflow `Canonical acceptance` recebe uma execução concluída do CI da aplicação, valida sua origem e executa a suíte aprovada contra o container candidato sem entregar segredos ao código candidato. Um GitHub App de QA separado publica o check `canonical-acceptance` no SHA da aplicação. Após merge e nova validação do commit integrado, o workflow promove a suíte revisada para `accepted`.

O QA é privado e o App implementador não está instalado nele. O plano GitHub atual não oferece proteção de branches para repositórios privados (HTTP 403). Por isso, o estado em `accepted` registra a árvore Git dos testes: um merge acidental que altere só os testes faz o aceite falhar. Esse registro detecta desvios acidentais; não substitui revisão independente nem impede um administrador com escrita de alterar estado e testes juntos. A [issue #31](https://github.com/IgnisDevNE/CircuitoNE/issues/31) acompanha essa limitação e a retirada das credenciais humanas do ambiente implementador.

O check só se torna obrigatório depois dos ensaios positivos e negativos da #31 e da configuração do App QA e dos environments. Antes disso, este repositório é uma preparação, não um gate ativo.
