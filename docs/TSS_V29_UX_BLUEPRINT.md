# TSS V29 — UX Blueprint v1.0

## Objetivo
Transformar o TSS em um sistema operacional simples, guiado e seguro, no qual qualquer usuário consiga entender o que fazer sem depender de treinamento técnico.

## Princípios do produto

1. O sistema deve explicar o problema e a próxima ação.
2. Cada perfil deve ver apenas o que utiliza.
3. Nenhuma decisão crítica pode depender apenas da memória do usuário.
4. A portaria deve localizar e validar uma pessoa em poucos segundos.
5. Regras de documentos e treinamentos devem ser configuráveis, sem alteração de código.
6. O status geral deve ser calculado a partir das pendências reais.
7. A linguagem da interface deve ser simples e orientada à ação.

## Perfis principais

### Empresa terceirizada
- Cadastrar trabalhadores.
- Enviar documentos.
- Corrigir pendências.
- Acompanhar liberações.
- Solicitar acesso.

### Gestor de terceiros
- Cadastrar e acompanhar empresas.
- Consultar trabalhadores e pendências.
- Cobrar regularizações.
- Acompanhar autorizações.
- Emitir relatórios.

### SESMT
- Validar documentos.
- Validar treinamentos.
- Configurar requisitos.
- Analisar exceções.
- Acompanhar conformidade.

### Supervisor ou solicitante
- Solicitar acesso.
- Informar área, atividade e período.
- Acompanhar aprovação.
- Confirmar a necessidade do serviço.

### Portaria
- Pesquisar pessoa.
- Ver foto, empresa e situação.
- Registrar entrada.
- Negar acesso com motivo.
- Registrar saída.

### Administrador
- Gerenciar usuários.
- Gerenciar unidades e áreas.
- Configurar perfis e permissões.
- Configurar requisitos e regras.

## Navegação principal por perfil

### Empresa terceirizada
- Início
- Trabalhadores
- Documentos
- Solicitações
- Pendências

### SESMT
- Início
- Central de validação
- Requisitos
- Exceções
- Relatórios

### Portaria
- Pesquisa de acesso
- Pessoas dentro
- Negativas
- Histórico do turno

### Administrador
- Visão geral
- Usuários
- Unidades e áreas
- Regras
- Auditoria

## Oito telas prioritárias

## 1. Login

### Objetivo
Permitir acesso simples e direcionar o usuário ao ambiente correto.

### Elementos
- E-mail.
- Senha.
- Recuperar senha.
- Entrar.
- Identificação da organização.

### Regra
Após o login, o usuário deve ser direcionado automaticamente para a tela principal do seu perfil.

---

## 2. Painel inicial

### Pergunta respondida
O que precisa da minha atenção hoje?

### Blocos sugeridos
- Aguardando validação.
- Documentos vencidos.
- Documentos próximos do vencimento.
- Trabalhadores bloqueados.
- Autorizações pendentes.
- Pessoas atualmente dentro.
- Saídas não registradas.

### Comportamento
Todos os cartões devem ser clicáveis e abrir a lista correspondente.

---

## 3. Central de validação

### Objetivo
Concentrar documentos, treinamentos e solicitações em uma fila única.

### Filtros
- Tipo de pendência.
- Empresa.
- Unidade.
- Urgência.
- Data de envio.
- Status.

### Cartão de validação
- Nome da pessoa ou empresa.
- Documento ou treinamento.
- Empresa.
- Data de emissão.
- Validade informada.
- Data de envio.
- Visualizar arquivo.
- Aprovar.
- Solicitar correção.
- Rejeitar.

### Regras de usabilidade
- Aprovação não deve exigir abertura de outra página.
- Rejeição deve exigir motivo.
- Solicitação de correção deve permitir mensagem objetiva.
- O sistema deve mostrar a próxima pendência após a decisão.

---

## 4. Cadastro guiado de terceiro

### Etapas
1. Identificação da pessoa.
2. Empresa de vínculo.
3. Função e atividade.
4. Unidade e área de atuação.
5. Riscos envolvidos.
6. Documentos e treinamentos exigidos.
7. Revisão e envio.

### Regras condicionais
- Visitante não recebe exigências de trabalhador operacional.
- Trabalho em altura exige NR-35 quando configurado.
- Espaço confinado exige NR-33 quando configurado.
- Atividade elétrica exige NR-10 quando configurado.
- Motorista utiliza fluxo específico.
- Campos desnecessários não devem ser exibidos.

### Salvamento
- Salvar rascunho.
- Continuar depois.
- Enviar para análise.

---

## 5. Prontuário da pessoa

### Cabeçalho
- Foto.
- Nome.
- Empresa.
- Função.
- Unidade.
- Status geral.

### Explicação do status
Exemplo:

> Acesso bloqueado porque o ASO está vencido e a integração ainda não foi validada.

### Abas
- Resumo.
- Documentos.
- Treinamentos.
- Autorizações.
- Acessos.
- Exceções.
- Histórico.

### Ações principais
- Editar cadastro.
- Anexar documento.
- Solicitar acesso.
- Bloquear pessoa.
- Consultar histórico.

---

## 6. Solicitação de acesso

### Campos
- Pessoa.
- Unidade.
- Área.
- Tipo de acesso.
- Atividade.
- Data e hora inicial.
- Data e hora final.
- Responsável interno.
- Observações.

### Validação antes do envio
O sistema deve mostrar:
- Requisitos atendidos.
- Requisitos pendentes.
- Bloqueios impeditivos.
- Exceções possíveis.

### Resultado
- Enviar para aprovação.
- Salvar rascunho.
- Solicitar exceção, quando permitido.

---

## 7. Tela da portaria

### Objetivo
Tomar a decisão de entrada em poucos segundos.

### Pesquisa
Permitir busca por:
- Nome.
- CPF.
- Empresa.
- Código.
- QR Code, futuramente.

### Resultado liberado
- Foto.
- Nome.
- Empresa.
- Destino.
- Responsável.
- Validade da autorização.
- Botão Registrar entrada.

### Resultado bloqueado
- Foto.
- Nome.
- Empresa.
- Motivo objetivo do bloqueio.
- Responsável para contato.
- Botão Registrar negativa.

### Segurança
A portaria não deve editar documentos, treinamentos ou regras.

---

## 8. Configuração de requisitos

### Objetivo
Permitir que o cliente configure regras sem programador.

### Exemplo
Tipo de atividade: Trabalho em altura

Exigir:
- ASO.
- Integração.
- NR-35.
- Autorização do supervisor.
- Aprovação do SESMT.

### Configurações
- Documento obrigatório.
- Treinamento obrigatório.
- Validade mínima restante.
- Unidade aplicável.
- Área aplicável.
- Tipo de pessoa.
- Tipo de atividade.
- Exige aprovação.
- Permite exceção.

## Status apresentados ao usuário

### Documentos e treinamentos
- Aguardando envio.
- Aguardando análise.
- Em análise.
- Aprovado.
- Correção solicitada.
- Rejeitado.
- Vencido.
- Vence em breve.

### Pessoas
- Liberado.
- Com pendências.
- Bloqueado.
- Inativo.

### Autorizações
- Rascunho.
- Aguardando aprovação.
- Em análise.
- Aprovada.
- Rejeitada.
- Cancelada.
- Expirada.

## Componentes reutilizáveis

- Cartão de pendência.
- Indicador de status.
- Linha do tempo.
- Visualizador de documento.
- Campo de busca global.
- Filtro rápido.
- Explicação de bloqueio.
- Botão de próxima ação.
- Confirmação de ação crítica.

## Regras de linguagem

Evitar:
- Processar.
- Executar.
- Pendente sem explicação.
- Status técnico em inglês.

Preferir:
- Enviar para o SESMT.
- Aprovar documento.
- Solicitar novo arquivo.
- Registrar entrada.
- Registrar saída.
- Corrigir pendência.

## Critérios de aceitação de cada tela

1. Um usuário novo entende o objetivo da tela.
2. A ação principal está visível sem rolagem excessiva.
3. O sistema explica bloqueios.
4. O sistema mostra a próxima ação.
5. Campos condicionais são exibidos somente quando necessários.
6. Ações críticas exigem confirmação.
7. O usuário não acessa funções fora do seu perfil.
8. A informação principal é localizada em menos de 10 segundos.

## Ordem de implementação

### Fase 1 — Protótipo operacional
1. Painel inicial.
2. Central de validação.
3. Prontuário da pessoa.
4. Tela da portaria.

### Fase 2 — Entrada de dados
5. Cadastro guiado.
6. Solicitação de acesso.

### Fase 3 — Administração
7. Configuração de requisitos.
8. Gestão de usuários e perfis.

### Fase 4 — Integração
9. Supabase.
10. Migração dos dados da V28.
11. Testes com usuários reais.
12. Entrada controlada em produção.

## Próximo artefato
Criar wireframes navegáveis das quatro telas da Fase 1 antes de alterar o `index.html` em produção.
