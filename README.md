# TSS — Controle de Terceiros

Plataforma para gestão exclusiva de pessoas externas à rotina permanente da unidade: terceiros, visitantes, motoristas, fornecedores e colaboradores temporários de outras unidades.

Funcionários internos fixos não fazem parte do cadastro de pessoas controladas. Eles podem existir futuramente apenas como usuários, responsáveis, solicitantes ou aprovadores.

## V29 — usabilidade e foco em terceiros

Branch: `feature/tss-v29-usabilidade-terceiros`

### Entregue

- Menu principal simplificado: Painel, Empresas, Terceiros, Documentos, Acessos e Portaria Express.
- Remoção das opções duplicadas `Portaria`, `Treinamentos`, `Dados` e `Cadastro` da navegação principal.
- Treinamentos e Dados movidos para Configurações.
- Painel responsivo voltado às pendências do dia, com ações rápidas e cartões clicáveis.
- Central de Validação com busca e filtros por tipo e urgência.
- Central de Documentos com estados vazio e com dados.
- Tela de Acessos com entradas, saídas, negativas e pessoas dentro da unidade.
- Portaria Express com confirmação para registrar entrada/saída e justificativa obrigatória para negativas.
- Prontuário com motivo de bloqueio e orientação para regularização.
- Cadastro com classificação explícita do tipo de pessoa e suporte a rascunho.
- Navegação e cartões adaptados para celular, tablet e desktop.
- Novos dados de acessos e rascunhos incluídos no estado já sincronizado com o Supabase.

### Compatibilidade e dados

A V29 preserva a integração existente com a tabela `app_data` do Supabase. Não houve exclusão de dados, mudança de credenciais ou substituição por dados simulados.

Não foi necessária migration: `acessos` e `rascunhos` foram acrescentados de forma compatível ao objeto JSON já armazenado em `app_data`.

### Verificações executadas

- Validação de sintaxe de todos os blocos JavaScript do `index.html`.
- `git diff --check`.
- Conferência dos identificadores de páginas, navegação e prontuário.
- Conferência da leitura, aplicação e sincronização dos novos campos no estado do Supabase.

O teste automatizado em navegador não pôde ser executado no ambiente de desenvolvimento porque o pacote Playwright não possui o binário Chromium instalado. A instalação automática também não estava disponível no ambiente.

### Próximas etapas estruturais

Estas funções dependem de autenticação, tabelas próprias e políticas RLS antes de serem disponibilizadas com segurança:

- usuários e perfis reais;
- isolamento por organização e unidade;
- acesso de empresas terceirizadas somente aos próprios registros;
- fluxo persistente de aprovação/rejeição de documentos;
- regras configuráveis por atividade, função, risco, área e tipo de acesso;
- arquivos em bucket privado do Supabase Storage;
- auditoria imutável no banco.

O arquivo único atual ainda contém várias camadas históricas. A separação em componentes deve ocorrer gradualmente em uma próxima branch, com testes de regressão, para não arriscar os dados e fluxos em uso.

## Publicação

Esta branch deve ser revisada por Pull Request. Não fazer merge automático na `main`.
