# TSS V29 — Database Blueprint

## Objetivo

Criar a nova base normalizada do TSS sem interromper a V28 atual. A tabela `app_data` continua intacta até a migração controlada dos dados.

## Princípios

1. Todo registro pertence a uma organização.
2. Terceiros, visitantes, motoristas e entregas compartilham a entidade `tss_people`, diferenciados por `person_type`.
3. O tipo de acesso define exigências e comportamento operacional.
4. Visitantes de reunião não recebem as mesmas exigências de terceiros operacionais.
5. Documentos futuros deverão pertencer obrigatoriamente a uma empresa ou pessoa.
6. Exclusão será lógica sempre que houver impacto em auditoria.
7. Perfil, permissão e escopo são tratados separadamente.
8. O frontend atual não será alterado nesta etapa.

## Entidades criadas

- `tss_organizations`: clientes do sistema.
- `tss_units`: unidades de cada cliente.
- `tss_areas`: áreas físicas e níveis de risco.
- `tss_companies`: empresas terceirizadas, transportadoras, fornecedores e origens de visitantes.
- `tss_people`: terceiros, visitantes, motoristas, entregadores e futuros funcionários.
- `tss_visit_purposes`: reunião, visita técnica, auditoria, entrevista, entrega e outros.
- `tss_access_types`: regras-base para cada forma de acesso.
- `tss_person_access_types`: vínculo da pessoa com tipo de acesso, unidade, área e validade.
- `tss_profiles`: papéis-base dos usuários.
- `tss_permissions`: ações granulares do sistema.
- `tss_profile_permissions`: permissões padrão de cada perfil.
- `tss_user_profiles`: perfis atribuídos a usuários reais do Supabase Auth.
- `tss_user_permissions`: exceções individuais de permissão.
- `tss_scopes`: organização, unidade, área, empresa, registros próprios ou portaria.
- `tss_user_scopes`: limites de atuação de cada usuário.

## Tipos de pessoa iniciais

- `THIRD_PARTY`: trabalhador terceirizado.
- `VISITOR`: visitante de reunião, auditoria ou visita técnica.
- `DRIVER`: motorista de coleta, descarga ou carregamento.
- `DELIVERY`: entrega de materiais, normalmente no almoxarifado.
- `EMPLOYEE`: reservado para expansão futura.
- `OTHER`: exceções controladas.

## Tipos de acesso iniciais

- Terceiro de Manutenção.
- Terceiro Administrativo.
- Visitante para Reunião.
- Visitante em Área Produtiva.
- Motorista.
- Entrega.

## Perfis iniciais

1. Administrador do Sistema.
2. Administrador do Cliente.
3. Gestor de Terceiros.
4. SESMT.
5. Supervisor / Gestor da Área.
6. Portaria.
7. Empresa Terceirizada.
8. Anfitrião / Solicitante.
9. Consulta.

## Modelo de autorização

Cada ação deverá verificar, nesta ordem:

1. O usuário está autenticado?
2. Pertence à mesma organização do registro?
3. Possui a permissão necessária?
4. A permissão está liberada dentro do escopo atribuído?
5. Existe alguma restrição de negócio específica?

## Segregação de funções

- Quem envia documento não deve validar o próprio documento.
- Quem solicita exceção não deve aprová-la sozinho.
- A portaria registra entrada e saída, mas não altera conformidade.
- A empresa terceirizada só atua nos próprios trabalhadores e documentos.
- O SESMT valida requisitos técnicos; o gestor aprova acesso dentro da própria competência.

## Estado da migração

### Concluído nesta branch

- Fundação multiempresa.
- Pessoas unificadas por tipo.
- Tipos de acesso e motivos de visita.
- Perfis, permissões e escopos.
- Índices básicos.
- RLS ativado nas novas tabelas.

### Ainda não ligado ao aplicativo

- Migração de `app_data` para tabelas normalizadas.
- Documentos e anexos no Storage.
- Treinamentos e matriz de requisitos.
- Autorizações, exceções, acessos e auditoria.
- Políticas RLS de produção vinculadas aos usuários.
- Alterações no `index.html`.

## Próxima etapa recomendada

Criar a migração 003 com documentos, tipos documentais, treinamentos, requisitos, autorizações, exceções, acessos e auditoria. Depois, validar todo o modelo antes de conectar o frontend.
