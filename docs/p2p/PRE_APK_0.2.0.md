# SST Manager 0.2.0 — marco pré-APK

Data do marco: 2026-10-26
Branch: `homologacao/p2p-local-first`
Código funcional validado antes deste registro: `868dcb47413006c62d98926e103268bd513843ef`
Base de produção preservada: `main` em `3a53c180bd90e28fc5edeae9db66281d9c447430`

## Regra desta etapa

Nenhuma promoção para `main`, nenhum APK, instalador ou chave permanente de assinatura deve ser gerado apenas por este marco. O objetivo é consolidar o código-fonte e reduzir defeitos antes do primeiro APK 0.2.0.

## 1. Login, sessão, saída e recuperação

- Login nativo usa identidade local cifrada; senha não é persistida em claro.
- Logout limpa a chave de assinatura da memória e encerra a sessão local.
- Reabertura exige autenticação quando a sessão está bloqueada.
- Tentativas repetidas com senha incorreta sofrem limitação temporal.
- A recuperação por kit + código está disponível a partir da própria tela bloqueada de login.
- Recuperar a identidade não autentica automaticamente: é obrigatório entrar com a nova senha.
- A senha antiga é rejeitada após recuperação.
- A nova senha continua válida após sair e entrar novamente.
- Recuperação preserva a mesma identidade pública, usuário, cargo, permissões e registros.
- Há teste dedicado de regressão para esses fluxos.

## 2. Cadastro e documentos

### Cadastro

- Cadastro novo e edição usam a mesma validação.
- CPF precisa ser matematicamente válido, não apenas possuir máscara.
- CPF duplicado é rejeitado também na edição.
- Empresa, função, ASO e integração obrigatórios são validados.
- ASO e integração exigem datas válidas.
- A listagem usa a função canônica de status das datas; ausência de data não aparece como `OK`.

### Documentos nativos

- Arquivos novos no modo nativo não podem ser gravados como `dataUrl` dentro do estado de negócio.
- Upload usa armazenamento privado nativo e valida conteúdo real do arquivo, extensão/MIME, tamanho e integridade.
- Documento é dividido em objetos privados e associado ao proprietário salvo.
- Leitura recompõe os bytes, confere tamanho + SHA-256 e valida novamente o arquivo.
- Portaria pode visualizar quando autorizada, mas não baixar/exportar.
- O armazenamento legado permanece somente para compatibilidade/migração; não é o desenho final do APK 0.2.0.

## 3. Central de Pendências

A Central existente foi ampliada, sem duplicar regras de acesso. Agora oferece visão rápida e lista detalhada para:

- bloqueados;
- ASO pendente ou vencido;
- integração pendente ou vencida;
- documentos vencidos;
- vencimentos em até 7 dias;
- cadastros incompletos.

Cada ocorrência identifica terceiro, empresa, CPF, motivo e ação necessária. Tocar no registro abre a análise do terceiro. A categoria `Bloqueados` usa a regra canônica de acesso do sistema.

BPF continua tratado como parte da integração. Treinamentos adicionais continuam como histórico/apoio e não foram transformados artificialmente em condição bloqueante.

## 4. Perfis e permissões

Perfis funcionais preservados:

- ADM: consulta, cadastro/edição, administração e liberação conforme política;
- Cadastro: consulta + cadastro/edição, sem liberação;
- SESMT: consulta + liberação, sem cadastro geral;
- Portaria: consulta, sem escrita, administração, cópias ou exportação de documentos.

A permissão efetiva é limitada pelo usuário, pelo aparelho e pelas restrições individuais. Uma conta não ganha autoridade apenas por estar em um aparelho com perfil superior. Revogação invalida o acesso e operações posteriores são recusadas.

## 5. Auditoria

O núcleo registra operações aceitas e rejeitadas, incluindo identidade do ator, aparelho/writer, entidade, registro, data informada, motivo e alterações. Assinaturas inválidas, replay entre grupos/aparelhos e usuários revogados são recusados e permanecem verificáveis na trilha.

Relatórios históricos deixam explícito que uma autorização calculada não comprova entrada física. Exportações de relatório usam proteção contra fórmulas de planilha e mantêm rastreabilidade da origem dos dados.

## 6. Indicadores

O dashboard continua apresentando total de terceiros, liberados/bloqueados, empresas e acesso à Central de Pendências. A Central é a fonte operacional detalhada para entender o motivo e a ação necessária; não devem ser criadas regras paralelas apenas para alimentar indicadores.

## 7. Interface mobile

A base já contém layouts responsivos para formulários, cards, busca, Portaria e navegação, além de paginação da Central de Pendências. Ajustes visuais adicionais devem ser feitos somente após teste em aparelho físico para evitar otimização baseada apenas em JSDOM/desktop.

## 8. Backup e operação offline

- Intenções assinadas ficam preservadas localmente quando não há confirmação disponível.
- Reabertura do processo reapresenta pendências em vez de descartá-las.
- Checkpoints são cifrados e objetos corrompidos são recusados antes da restauração.
- Restauração exige prévia, revisão, motivo e confirmação administrativa.
- Recuperar um checkpoint não deve ressuscitar automaticamente liberações por exceção.
- Há handover planejado do indexador para outro aparelho administrador.
- Não existe eleição automática segura com apenas dois aparelhos durante uma partição de rede.

## Validação automática do marco

Commit funcional validado: `868dcb47413006c62d98926e103268bd513843ef`.

- `SST security regression` run `40322797444`: build consistente, `git diff --exit-code` e suíte completa aprovados.
- `SST native source checks` run `40322797543`:
  - Linux: aprovado;
  - Windows: aprovado;
  - Android/Bare + compilação Java: aprovado;
  - nenhum APK foi empacotado.

## O que ainda exige aparelho físico antes de chamar 0.2.0 de pronto

1. Instalar o APK de homologação em um Android real e testar várias sequências de login, logout, fechamento forçado e reabertura.
2. Testar recuperação de acesso no Android com seletor real de arquivo, kit e código guardados separadamente.
3. Testar rotação de tela, suspensão, retomada e encerramento do processo pelo Android.
4. Testar anexar, visualizar e remover documentos reais suportados, inclusive arquivos inválidos/corrompidos.
5. Validar ergonomia mobile da Central de Pendências, cadastro, análise e Portaria.
6. Testar base maior para verificar desempenho, paginação e armazenamento do aparelho.
7. Quando houver um PC disponível, executar o roteiro de pareamento PC ↔ celular em redes iguais e diferentes.
8. Antes de uma distribuição persistente, criar e guardar a chave permanente de assinatura fora do aparelho e do repositório.

## Pendências arquiteturais conhecidas para etapas posteriores

- exportação externa completa cifrada para cenário de perda de todos os aparelhos;
- restauração geral muito grande de forma fracionada;
- procedimento explícito para perda inesperada do único indexador;
- teste físico de travessia de NAT/dados móveis;
- empacotamento do processo local em instalador Windows quando houver PC para homologação.
