# Interface P2P de homologação

O pacote nativo isolado reutiliza as telas existentes e conecta login, cadastros, usuários, auditoria e documentos ao núcleo local real. O build web padrão permanece no backend anterior; abrir o endereço público atual não ativa P2P. O APK Android de homologação foi produzido e validado em emulador; veja `ANDROID.md`.

## Organização

- `scripts/p2p/ui-sources.json` compõe um backend alternativo: os fragmentos compartilhados permanecem na mesma IIFE. O pacote não carrega os dois backends juntos.
- `src/backend/p2p-ui/` contém transporte, inicialização e visualização locais. Os nomes legados de sincronização são adaptadores, sem chamadas ao Supabase.
- `src/platform/native/frontend-service.mjs` traduz os contratos existentes para operações assinadas. Salva diferenças por registro, verifica versões e aguarda recibo finalizado; lotes validam todas as permissões/revisões antes de alterar registros.
- `browser-bridge.js` e `browser-host.mjs` ligam o pacote ao processo deste aparelho na homologação. O host escuta somente em `127.0.0.1`, exige origem/cookie/token local e serve apenas arquivos com hashes do manifesto. Não é um servidor central. O empacotamento Android deverá fornecer sua ponte local.
- O leitor reaproveita PDF.js e o validador de documentos existente. Conteúdo fica dividido em blocos replicados, com metadados, tamanho e SHA-256 conferidos na leitura. Novos anexos inline são recusados.

## Sessão e perfis

A primeira abertura exige criação explícita do administrador inicial. As contas locais usam o cofre cifrado já existente; o modal de usuários pode criar identidades e autorizar/revogar seus acessos. Permissões só podem restringir o perfil selecionado. A autorização efetiva também considera o perfil do aparelho.

Logout e expiração removem dados privados da memória, DOM e armazenamento de interface. Leituras periódicas não renovam a inatividade; uma nova sessão após limpeza reconstrói as telas por recarregamento. A réplica cifrada no disco não é apagada pelo logout.

Portaria consulta todos os terceiros e visualiza sua documentação. O aplicativo oculta edição, download e exportação; o serviço recusa escrita e download, e o materializador recusa operações não autorizadas. Imagens são exibidas sem links de download; PDFs usam canvas, sem a barra de download do navegador. Há limites de páginas/pixels. Isso não impede capturas de tela nem extração por quem controla o aparelho ou as chaves.

A situação de entrada fica **NÃO CONFIRMADO**: o relógio do aparelho não substitui confirmação temporal independente. Não usar a tela para autorizar entrada real nesta fase. Relatórios históricos ainda sem migração retornam mensagem explícita de indisponibilidade; a auditoria nova pode ser consultada, com horário declarado pelo aparelho.

## Preparação técnica com dados fictícios

```sh
npm ci
npm run build
python3 deploy/internal/download-assets.py /CAMINHO/ocr-assets
SST_OCR_ASSETS=/CAMINHO/ocr-assets SST_NATIVE_UI_OUT=.sst-native-ui npm run p2p:build-ui
npm run p2p:browser -- .sst-device/ui .sst-native-ui
```

São comandos de homologação do adaptador Node, não instrução para instalar servidor no notebook de Pablo. Nenhum backup, conta real ou base existente deve ser usado neste ensaio. O pacote usa 18 dependências OCR/PDF locais verificadas pelo manifesto. Não existe sincronização automática com dados reais do backend antigo.

## Evidências e limites

`npm run build` e a suíte completa passaram. Os 12 testes P2P incluem bancos/criptografia reais, integração das telas reais em JSDOM e um host HTTP loopback real. O cenário visual cobre administrador inicial, senha errada/correta, empresa, terceiro, criação de Portaria, documento PNG, bloqueios de escrita/download, logout e expiração. O cenário de serviço cobre lote atômico, revisão antiga, integridade documental, permissões restritas e conta desativada. JSDOM injeta somente o transporte para o serviço real; não simula o banco. A suíte antiga mantém seus transportes simulados onde indicado.

A versão Android foi instalada em emulador, com renderização real de PDF no WebView e reabertura autenticada; veja `ANDROID.md`. Ainda não foram validados Chrome desktop, aparelho físico arm64, Keystore, suspensão do sistema Android ou redes diferentes. A tentativa de obter Chromium não concluiu, portanto não se declara teste visual real. Recuperação/rotação de identidade, vinculação de outros aparelhos, migração integral e substituição segura do indexador continuam pendentes. O aparelho criador ainda é o único indexador.

O trabalho fica na branch `homologacao/p2p-local-first`, PR #5 em rascunho. Main e `backup/pre-p2p-2026-10-24-3a53c18` permanecem em `3a53c180bd90e28fc5edeae9db66281d9c447430`; não houve restauração, importação de backup nem promoção para produção.
