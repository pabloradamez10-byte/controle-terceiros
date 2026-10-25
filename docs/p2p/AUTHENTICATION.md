# Proteções individuais no núcleo P2P de homologação

## O que foi implementado

O protocolo experimental é agora `sst-p2p-v2`. Cada operação de alteração carrega uma assinatura Ed25519 individual, vinculada ao grupo e à chave escritora do aparelho. A representação assinada usa a biblioteca canonicalize (JCS/RFC 8785); as assinaturas usam hypercore-crypto. O materializador verifica a assinatura e a interseção entre permissão da pessoa e do aparelho, independentemente da interface.

Uma chave de replicação ou um aparelho ADM, sozinhos, não autorizam alterações como usuário ADM. Operações sem assinatura, com conteúdo/autor alterado ou copiadas para outro grupo/aparelho são rejeitadas. A autorização de usuários é replicada e só pode ser alterada por pessoa ADM em aparelho ADM. Revogação entra em vigor nos nós quando se propaga; não fornece apagamento remoto nem relógio global para atos produzidos offline.

Os arquivos de identidade locais guardam a chave privada cifrada com XChaCha20-Poly1305 e chave derivada da senha com Argon2id (parâmetros INTERACTIVE da libsodium). Salt e nonce são aleatórios. As primitivas são da biblioteca sodium-native, sem algoritmo criptográfico próprio. As senhas e chaves privadas não são replicadas nem retornadas pela ponte. O arquivo é criado exclusivamente com modo 0600; conta existente não é sobrescrita.

`SstSession` mantém uma identidade ativa por processo/aparelho. A ponte começa bloqueada, exige login individual, encerra por saída ou 15 minutos de inatividade e revalida usuário/aparelho antes dos comandos. Logout e falhas limpam a chave privada mantida em buffer pela sessão; strings de senha recebidas pelo JavaScript não têm garantia de apagamento pelo coletor de memória. Após cinco falhas, a sessão bloqueia novas tentativas por 30 segundos. O contador é local em memória, não impede ataque offline ao arquivo ou reinício por alguém com acesso ao sistema operacional.

## Regras

| Pessoa e aparelho | Consulta | Cadastro/edição | Excluir cadastro | Exceções | Administrar usuários/aparelhos |
|---|---|---|---|---|---|
| ADM + ADM | Sim | Sim | Sim | Sim | Sim |
| Cadastro + aparelho compatível | Sim | Sim | Não | Não | Não |
| SESMT + aparelho compatível | Sim | Não | Não | Sim | Não |
| Portaria + aparelho compatível | Todos os terceiros e documentação (visualizador nativo pendente) | Não | Não | Consulta apenas | Não |

O resultado é a interseção das permissões: um usuário ADM em aparelho Portaria não ganha escrita; um usuário Portaria em aparelho ADM também não. Download/exportação documental são recusados para Portaria; a interface nativa fornece visualização, conforme `INTERFACE.md`. Exibir o documento exigirá receber conteúdo no aparelho; não há promessa de impedir captura de tela ou cópia externa.

## Auditoria

O núcleo grava recibo e evento de auditoria em sua projeção determinística para operações reconhecidas pelo protocolo, aceitas ou rejeitadas. O evento registra operação, aparelho, identidade verificada, resultado e motivo. Um autor falsificado é armazenado como alegação (`claimedActor`) e não como identidade comprovada; `actor` fica nulo quando a assinatura falha. `reportedAt` é um horário informado pelo aparelho, não uma prova de horário ou critério de validade. A ordem é do log replicado.

Eventos provisórios podem ser reordenados pelo Autobase. Usar `finalized` dos recibos para distinguir confirmação assinada. A consulta de auditoria exige pessoa/aparelho ADM e atualmente limita a primeira página a 500 eventos; paginação da interface fica pendente. Versões/formas de operação recusadas antes da projeção não recebem evento, portanto não chamar essa trilha de registro completo de todas as tentativas de acesso.

## Ponte local

Executar `npm run p2p:device -- .sst-device/administrador`. O processo não abre HTTP. Antes do primeiro uso, `initializeOwner` cria explicitamente a identidade administradora inicial; só funciona uma vez no aparelho criador. A chave inicial de proprietário é fixa nesta fase; recuperação/rotação de proprietário ficam pendentes.

Comandos de autenticação: `initializeOwner`, `createIdentity`, `login`, `logout`, `status`. `createIdentity` apenas cria a credencial local, sem aprovar o usuário. O ADM precisa autorizar a chave pública com `authorizeUser`, e autorizar o aparelho com `grant`. Depois do login, `identity` informa a chave pública e perfil sem retornar segredo.

`createInvitation` exige sessão ADM em aparelho ADM. A integração nativa salva um arquivo exclusivo 0600 na subpasta `invitations/`, retorna somente o caminho e não aceita caminho de destino arbitrário. `--invite-out` sem autenticação não é mais permitido. Convites contêm segredo do grupo e não devem ir para Git ou logs.

## Compatibilidade e limites

- O build web padrão continua no backend atual; o pacote isolado conecta as mesmas telas/login ao núcleo nativo. Nenhum usuário, senha ou registro Supabase foi alterado ou migrado.
- O protocolo v1 experimental, sem assinatura individual, não deve ser ativado como alternativa ao v2. Configuração/convite v1 é recusado pela entrada de arquivos; não há migração automática de bancos v1.
- A ponte Android e o visualizador PDF foram validados no WebView de um emulador, incluindo login e reabertura. Ainda faltam teste físico arm64, Keystore, recuperação de identidade e vinculação automática do mesmo usuário em outro aparelho. Criar o mesmo nome em outro local não comprova a mesma identidade.
- A cópia local e a chave compartilhada de dados já recebidas não são apagadas por logout/revogação. Proteções contra acesso físico, extração da réplica ou comprometimento do sistema operacional não foram comprovadas.
- A sessão é uma barreira da ponte nativa. Quem controla o processo ou já possui chaves pode chamar APIs internas; não tratar o contrato JavaScript como sandbox contra o dono do aparelho.
- O aparelho criador continua sendo o único indexador. Redes diferentes e operação Android em segundo plano permanecem sem ensaio.
- O backup e os ambientes existentes não foram modificados. Testes usam somente diretórios temporários e identidades fictícias.

## Verificação

Os 12 testes P2P incluem autenticação com Argon2id/AEAD/assinaturas e bancos reais, as telas reais em JSDOM com o serviço nativo e o host loopback HTTP (ver `INTERFACE.md`). Cobrem credenciais cifradas, senha errada, corrupção, não sobrescrita, logout, expiração, limite de tentativas, reinício bloqueado, troca de pessoas no mesmo aparelho, interseção de perfis, bloqueio de exclusão, assinaturas ausentes/forjadas, replay entre grupo/aparelho, auditoria e revogação propagada. A suíte de regressão do SST é executada por `npm test`.
