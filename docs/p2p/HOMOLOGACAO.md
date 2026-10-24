# SST: núcleo local e replicação entre aparelhos

## Estado desta entrega

Implementação experimental na branch `homologacao/p2p-local-first`, a partir do commit `3a53c18`. Não altera o backup, a branch de backup, produção, banco Supabase, usuários ou documentos reais. As fontes web e seus arquivos gerados permanecem com o mesmo comportamento. Não há um APK novo nesta entrega.

Há um núcleo P2P real no código do SST, com armazenamento em disco, replicação Hypercore/Autobase e comunicação Hyperswarm opcional. A entrada de homologação é um processo local por stdio. Não abre servidor HTTP nem necessita de um servidor de banco. O aplicativo web ainda utiliza seu backend atual; não anunciar que a migração já terminou.

## Bibliotecas reaproveitadas

| Biblioteca | Versão | Licença | Responsabilidade |
|---|---|---|---|
| autobase | 7.28.2 | Apache-2.0 | Logs multiwriter, ordenação causal, projeção e replicação |
| corestore | 7.16.1 | MIT | Armazenamento local de cores Hypercore |
| hyperbee | 2.27.3 | MIT | Índice persistente dos registros e recibos |
| hyperswarm | 4.17.2 | MIT | Descoberta e conexão P2P |
| hypercore-crypto | 3.7.0 | MIT | Geração criptográfica de chaves/identificadores |
| b4a | 1.9.0 | Apache-2.0 | Tratamento de bytes entre runtimes |
| canonicalize | 5.1.0 | Apache-2.0 | Representação canônica das operações assinadas |
| sodium-native | 5.2.0 | MIT | Argon2id e criptografia autenticada das identidades |

Bibliotecas são instaladas como dependências fixadas, com integridade no lockfile, e mantêm suas licenças nos pacotes. Não copiamos o aplicativo de senhas inteiro nem código de produto proprietário. Regras específicas do SST (perfis, versões, validação e conflitos) permanecem nossas.

## Referência e uso do REA

Foi estudado o repositório público `tetherto/pearpass-lib-vault-core` no commit `7c833475a7335a0a7b1d340c474433af8be23289`, além do aplicativo móvel e das APIs oficiais das bibliotecas.

O REA 6.7.0 foi executado. `import-reference-source --detail summary` concluiu o inventário de referência: 88 arquivos com hash, 13 diretórios, 208 relacionamentos, zero falhas de leitura e uma exclusão (`.git`). A ferramenta classifica o resultado como referência histórica e inventário parcial; não é evidência de comportamento em execução. Resumo retido em `docs/p2p/rea-reference-summary.json`.

A análise semântica `analyze-javascript-application` de uma amostra de quatro arquivos não concluiu: o REA recusou iniciar o processo auxiliar por incompatibilidade de `ps`/observação de propriedade de processos no ambiente isolado. Não desativamos essa proteção e não atribuímos ao REA as conclusões obtidas por leitura direta e testes.

O README atual do PearPass informa desenvolvimento pausado. O aplicativo é uma referência de organização; não assumimos suporte ativo ou compatibilidade automática com SST/Android.

## Organização e fluxo

- `protocol.mjs`: formato versionado e regras de permissão do SST.
- `materializer.mjs`: aplica operações determinísticas ao Hyperbee dentro do Autobase; nenhum relógio, rede ou efeito externo na projeção.
- `device.mjs`: bibliotecas de armazenamento, recibos, replicação, descoberta e encerramento.
- `repository.mjs`: contrato de comandos para a futura ponte da interface.
- `device-files.mjs`: configuração e arquivos privados do aparelho de teste.
- `scripts/p2p/device.mjs`: ponte local stdio, sem porta pública.

Cada registro tem ID, revisão, aparelho autor e identidade individual verificada. O protocolo atual é `sst-p2p-v2`; veja `AUTHENTICATION.md` para login, assinaturas e auditoria. A edição informa a revisão anterior. Duas edições concorrentes da mesma revisão não são aceitas silenciosamente: uma é mantida na projeção e a outra recebe recibo de conflito, após convergência. Registros diferentes convergem sem substituir um JSON de base inteiro. Exclusões são tombstones, impedindo ressurreição por escrita antiga.

`accepted` representa a decisão da projeção local e pode ser provisória. Somente `finalized: true` indica que o recibo está no prefixo assinado do índice. Não apresentar uma operação provisória como sincronizada/definitiva ou como liberação de acesso confirmada. Uma observação local pode mudar quando logs concorrentes chegam.

## Executar com dados fictícios

```sh
npm ci
npm run build
npm test
npm run p2p:device -- .sst-device/administrador
```

A entrada começa bloqueada e recebe um JSON por linha. Primeiro criar explicitamente o administrador com `initializeOwner` (nome e senha local de pelo menos 10 caracteres) ou entrar com `login`. As senhas trafegam apenas no canal local e não devem ser escritas em comandos de shell, logs ou arquivos versionados. Os exemplos abaixo pressupõem sessão autenticada:

```json
{"requestId":1,"command":"status"}
{"requestId":2,"command":"put","entity":"empresas","recordId":"empresa-teste","value":{"nome":"Empresa fictícia"}}
{"requestId":3,"command":"list","entity":"empresas"}
```

Edições e exclusões devem informar `previous` com a revisão retornada pela consulta. `receipt` recebe `operationId`. Comando não listado é recusado; não se expõe `append` bruto pela ponte. Fechar stdin encerra o núcleo e fecha os bancos. Não há coleta de senhas da aplicação atual nem acesso ao backup.

Para experimentar descoberta posteriormente, usar `--network`. Criar convite exige o comando autenticado `createInvitation`, de pessoa ADM em aparelho ADM; a opção sem login `--invite-out` foi desativada. O arquivo contém chave secreta; é criado com modo 0600 e nunca sobrescrito, não é impresso e não deve ser colocado no Git. Para outro aparelho usar diretório novo e `--join ARQUIVO.invitation.json`; o administrador precisa autorizar separadamente sua chave de escritor com `grant`. **Não usar essa configuração com dados reais.**

O diretório privado usa modo 0700. A chave do grupo fica em arquivo 0600 neste protótipo Node: isso não equivale ao Keystore do Android. A sincronização exige conectividade entre cópias; um aparelho desligado não recebe alterações naquele momento.

## Testes e alcance

Os testes de `tests/p2p/` instanciam Corestore/Autobase/Hyperbee reais em diretórios temporários. Pares são conectados por streams reais de replicação em processo, sem mock do banco e sem Supabase. Isso comprova o motor de armazenamento/replicação, não NAT traversal ou Android em segundo plano.

Cobertura: persistência após reinício e identidade estável; escrita entre dois nós; escrita offline e reconexão; edição concorrente/conflito; tombstones; isolamento entre dois grupos; perfis Cadastro, SESMT e Portaria; recusa de escalada de privilégio no materializador; revogação de escrita após propagação; limite por bytes/Unicode; versão desconhecida e campos perigosos; prévia de migração sem escrita; arquivos privados sem sobrescrita; ponte stdio; regressões existentes do SST.

## Bloqueios antes de ativar no aplicativo ou produzir

1. **Android e interface:** empacotar os arquivos web localmente e conectar a ponte nativa, incluindo ciclo de vida e suspensão. Não há SDK Android configurado neste ambiente; não foi gerado/testado APK.
2. **Portaria (regra confirmada por Pablo):** consulta todos os terceiros e pode visualizar sua documentação. Não cadastra, edita, exclui, libera nem recebe comandos de download/exportação. A ponte P2P permite consultar cadastros; validações de escrita também ocorrem no materializador. O pacote isolado já conecta o visualizador ao núcleo, sem controles de download para Portaria; PDF em navegador real ainda exige ensaio. Exibir conteúdo exige recebê-lo no aparelho: não prometer impedir capturas de tela, extração por outro programa ou cópia fora dos controles do aplicativo. A posse da chave de replicação não deve ser tratada como proteção contra cópia por participante autorizado.
3. **Usuários e identidade:** autenticação individual, assinatura, autorização/revogação propagada e trilha de pessoa/aparelho foram implementadas no núcleo (ver `AUTHENTICATION.md`). O pacote isolado integra o login visual. Ainda faltam recuperação/rotação de identidade e vinculação segura de outros aparelhos ao mesmo usuário. Não se migraram contas reais.
4. **Disponibilidade de confirmação:** o criador é o único indexador nesta implementação. Outro aparelho pode registrar alterações locais, mas a confirmação final exige o indexador. Ainda não há substituição/recuperação segura de indexador.
5. **Revogação:** impede operações futuras após propagação; não apaga dados já copiados, não revoga acesso retroativamente e não gira a chave do grupo. Revogação concorrente/offline exige política de causalidade adicional.
6. **Migração:** implementada somente prévia de cadastros. Migrar anexos, usuários, auditoria e exceções exige mapeamento próprio, validação e restauração ensaiada. Nenhuma exceção antiga deve se tornar liberação automática.
7. **Redes diferentes:** CGNAT, operadoras e redes corporativas ficam para ensaio posterior. Hyperswarm usa descoberta distribuída; alguns casos necessitam relay. Não prometer conexão direta universal ou ausência de toda infraestrutura auxiliar.
8. **Acesso físico:** guardar chaves em Keystore/armazenamento seguro e proteger exportação/restauração. Criptografia de blocos não protege contra alguém com acesso à chave local.

O núcleo de autenticação individual já tem testes, mas os bloqueios de integração acima permanecem. As telas e o login já foram integrados ao pacote de homologação (ver `INTERFACE.md`). O próximo marco é empacotar e testar a ponte Android; promover este núcleo diretamente para produção não é autorizado por estes testes.
