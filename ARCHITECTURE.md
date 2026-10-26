# Organização do SST Manager

## Onde corrigir

O código editável fica em `src/`. `index.html` contém a estrutura das telas e os links de carregamento, sem blocos de JavaScript ou CSS embutidos. A marcação dos formulários e alguns atributos de estilo ainda ficam no HTML; a retirada de todo estilo inline não faz parte desta mudança.

| Pasta | Responsabilidade |
|---|---|
| `src/shared/` | Armazenamento local temporário, datas, busca e utilitários compartilhados |
| `src/navigation/` | Navegação e eventos de formulários |
| `src/features/terceiros/` | Cadastro, edição, lista e filtros de terceiros |
| `src/features/empresas/` | Cadastro, análise, lista, alertas e painel de empresas |
| `src/features/treinamentos/` | Treinamentos, sugestões e relatórios relacionados |
| `src/features/portaria/` | Consulta de portaria da base existente |
| `src/features/excecoes/` | Autorizações, seleções e compatibilidade de exceções |
| `src/features/documentos/` | Leitura, revisão, migração de anexos e indicadores legados |
| `src/features/acesso/` | Regras legadas e confirmação atual pelo servidor |
| `src/features/auditoria/` | Histórico e relatórios auditáveis |
| `src/features/dashboard/` | Indicadores, resumo executivo e filtros interativos |
| `src/features/dados/` | Importação e exportação |
| `src/features/*.js` | Complementos existentes: pendências, matriz de treinamentos, portaria e visualização documental |
| `src/backend/` | Contexto, requisições autenticadas, sessão/perfil, permissões, usuários, persistência e inicialização |
| `src/backend/p2p/` | Núcleo nativo experimental: protocolo SST, projeção determinística, armazenamento/replicação e contrato de repositório |
| `src/platform/native/` | Integração de arquivos do aparelho para homologação em Node; não carregar no navegador |
| `src/security/` | Sanitização e proteção de conteúdo no navegador |
| `src/platform/` | Service worker e limites do cache público |
| `src/styles/` | Aparência geral, autenticação, pendências e portaria |
| `supabase/` | Funções e controles do servidor e do banco |
| `tests/` | Verificações de segurança, regras, sincronização e instalação |
| `deploy/internal/` | Preparação de instalação independente e backup |
| `scripts/p2p/` | Entrada nativa de homologação por stdio; nenhum servidor HTTP |

## Núcleo P2P de homologação

O núcleo experimental está isolado no mesmo projeto. `scripts/native-sources.json` é seu mapa de fontes ESM e entradas. A verificação de organização exige propriedade explícita e impede que essas fontes sejam colocadas no HTML ou no cache público. O mapa `scripts/sources.json` continua responsável apenas pelos arquivos web gerados. Os fragmentos `.part.js` existentes permanecem no escopo original.

O contrato em `src/backend/p2p/repository.mjs` é a fronteira para integrar as funcionalidades do SST: as telas não devem importar bibliotecas de rede ou banco. O núcleo usa Corestore, Autobase, Hyperbee, Hyperswarm, hypercore-crypto, b4a, canonicalize e sodium-native, com versões exatas e lockfile. Não se criou criptografia, protocolo de replicação ou banco próprios.

Nesta etapa **o núcleo não está conectado às telas nem ao login atual**. Não foi retirado o Supabase do aplicativo web. A ponte de homologação por stdio executa o núcleo real sem Supabase e sem HTTP. Ela exige sessão individual e operações assinadas, além de testar persistência e mensagens locais; não é a ponte Android final. A ativação no aplicativo deve ser uma mudança posterior explícita, com integração da identidade e visualização documental, migração completa e testes de aparelho. Consulte `docs/p2p/HOMOLOGACAO.md` para execução, limites e bloqueios de produção.

## Fonte e arquivos gerados

`scripts/sources.json` é o mapa oficial: informa quais fontes compõem cada arquivo entregue ao navegador e em qual ordem. `scripts/build.cjs` junta essas fontes sem acrescentar escopos, renomear funções, executar código ou transformar as regras. Não usa downloads nem ferramentas de compilação externas.

Os arquivos `assets/js/*`, `assets/css/*`, `security.js`, `access.js`, `documentos.js`, `relatorios.js` e `service-worker.js` são **gerados**. Os nomes da raiz foram mantidos para compatibilidade. Não corrigir os gerados diretamente: a próxima montagem substituiria a correção. Editar a fonte em `src/` e gerar novamente.

```sh
npm ci
npm run build
npm test
```

`npm run build` monta os arquivos e atualiza a política de carregamento do HTML. `npm test` recusa arquivos gerados diferentes de suas fontes e verifica sintaxe, propriedade única de cada fonte, ordem de carregamento, cache e os testes funcionais existentes. A CI também monta e exige que essa montagem não deixe diferenças em relação ao commit.

Para adicionar uma fonte, registrar no grupo adequado de `scripts/sources.json`. Para criar um novo arquivo entregue ao navegador, registrar também sua posição em `index.html` e no cache público em `src/platform/service-worker.js`; a verificação de estrutura acusa referências ausentes. Ao publicar mudanças em arquivos já existentes, atualizar a versão das URLs afetadas no HTML/cache e o nome do cache tanto em `src/platform/service-worker.js` quanto na lista de cache preservado em `src/security/browser.js`. Isso evita reutilizar conteúdo antigo no navegador. O pacote interno obtém os arquivos gerados pelo mesmo mapa, sem copiar todo o repositório para a pasta pública.

## Por que ainda há compatibilidade legada

A base possui substituições sucessivas de funções e estado global. Nesta primeira organização, a ordem, o escopo original e os corpos das funções foram preservados: 7 blocos de JavaScript e 5 blocos de estilos extraídos mantiveram seus bytes originais. A divisão do bloco principal por área foi feita em fronteiras de declarações; a montagem preserva o mesmo bloco inteiro para manter o comportamento de funções declaradas adiante.

Os arquivos `src/backend/*.part.js` são fragmentos de uma única função de inicialização fechada: compartilham variáveis privadas e **não devem ser carregados individualmente**, executados com Node ou convertidos isoladamente para módulos. Seu conjunto é verificado sintaticamente após a montagem. Esse cuidado preserva o encapsulamento já existente de sessão e permissões.

`extractedSha256` no mapa registra a origem desta extração; não é o hash da versão atual nem bloqueia futuras alterações. As verificações permanentes comparam os gerados com suas fontes atuais.

Esta organização não afirma que todas as dependências globais ou versões legadas foram removidas. A próxima refatoração pode retirar substituições antigas e introduzir interfaces explícitas por área, uma de cada vez, com testes. Até lá, ao localizar várias definições de uma função, conferir qual atribuição vence na ordem do mapa antes de editar. A confirmação oficial de acesso continua no servidor; as regras legadas não devem substituir essa confirmação.

## Controle e validação desta mudança

- HTML reduzido de 370.229 para aproximadamente 35 mil bytes, mantendo a marcação das telas.
- Nenhuma tabela, política, conta, documento ou registro de negócio alterado.
- Testes existentes executam os arquivos separados na ordem real. Testes isolados de regras e sincronização usam um carregador que reconstitui os antigos blocos apenas no ambiente de teste.
- O pacote interno continua gerando uma configuração independente, com dependências de leitura locais e sem endereço do serviço hospedado.
- Testes com backend simulado não são login real; homologação autenticada, restauração de backup e ensaio de servidor continuam pendentes.
- Para reversão de código, usar o commit anterior completo, incluindo HTML e cache; não reverter apenas um arquivo gerado. Não é necessário reverter banco nesta organização.

A segurança individual P2P fica em `src/backend/p2p/signatures.mjs` e `session.mjs`; a persistência cifrada de credenciais do host Node fica em `src/platform/native/identity-vault.mjs`. A projeção verifica assinaturas e perfis sem depender das telas. Detalhes e limites em `docs/p2p/AUTHENTICATION.md`.

## Composição alternativa da interface P2P

`scripts/p2p/ui-sources.json` reutiliza os fragmentos backend compartilhados em uma única IIFE, com transporte e inicialização próprios em `src/backend/p2p-ui/`. `sessao-interface.part.js` reúne apenas a interface visual de bloqueio/limpeza, sem transporte. O build padrão mantém seu backend anterior; o pacote isolado é montado por `scripts/p2p/build-ui.cjs`. Não inserir código nativo nos bundles web comuns.

`src/platform/native/frontend-service.mjs` converte os contratos das telas em lotes assinados, usuários e documentos do núcleo. O adaptador loopback em `browser-host.mjs` é por aparelho e somente para homologação; o Android ainda precisa de ponte/empacotamento. Detalhes de segurança, execução e testes em `docs/p2p/INTERFACE.md`. A confirmação de entrada permanece bloqueada no pacote P2P até existir prova temporal independente.

`android/` contém o host Android separado, a ponte WebMessage e o empacotamento Bare; seus assets/bibliotecas gerados nunca entram nos bundles web nem no Git. Veja `docs/p2p/ANDROID.md`. A entrada Android mantém rede P2P desativada nesta primeira homologação local.

## Fonte multiaparelho de homologação

O ciclo de vida compartilhado PC/Android, convites, recuperação, fila cifrada e cópias estão descritos em [docs/p2p/MULTIDEVICE.md](docs/p2p/MULTIDEVICE.md). Não há failover automático com dois aparelhos, teste de Internet física nem novo APK nesta entrega.
