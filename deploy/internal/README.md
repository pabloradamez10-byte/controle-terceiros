# SST — preparação da etapa 3 para a Tangará

**Estado: preparação técnica testada; instalação interna, migração e recuperação ainda não executadas.** Não houve alteração no banco atual, nas permissões, nos usuários ou no site público nesta etapa. Não há acesso ao servidor da Tangará neste ambiente. A homologação autenticada e a migração dos três anexos legados da etapa 2 continuam pendentes.

## Arquitetura preparada

Navegador → HTTPS na rede interna → Nginx → gateway privado do Supabase → Auth, REST, Storage e Functions → PostgreSQL e arquivos persistentes locais. Supabase aqui é o software instalado na empresa; não significa manter o banco na nuvem. A decisão final de infraestrutura e operação cabe ao TI da Tangará.

Este diretório fornece o frontend e a conexão ao backend oficial. Não fornece uma instalação completa do Supabase nem instala serviços automaticamente. Manter a composição oficial de serviços compatíveis, em revisão/commit fixado pelo TI, em vez de inventar uma composição parcial do banco/autenticação.

O frontend gerado usa `/backend` na mesma origem e somente dependências locais. O pacote de PDF/OCR possui 18 arquivos com tamanho e SHA-256 fixados em `assets-lock.json`, incluindo português, os quatro carregadores de WASM e respectivas licenças. O build recusa dependências ausentes ou alteradas, chave privilegiada, HTTP e sobrescrita de uma versão existente. Fontes usam a alternativa local já disponível no CSS. A leitura e a revisão humanas continuam disponíveis; não são substituídas por aprovação automática.

## Informações necessárias do TI

| Item | Definição necessária |
|---|---|
| Hospedagem | VM/servidor Linux, Docker/Compose disponíveis e responsável pela manutenção |
| Capacidade | A documentação do Supabase informa mínimo de 2 núcleos, 4 GB RAM e 40 GB SSD; recomenda 4 núcleos, 8 GB+ e 80 GB+. Dimensionar com teste de carga e crescimento dos anexos. |
| Endereço | DNS interno e certificado HTTPS confiável nos computadores e celulares autorizados |
| Rede | IP privado de escuta; gateway e banco sem publicação na internet; acesso administrativo restrito ao TI |
| E-mail | SMTP corporativo aprovado para convites e recuperação de senha |
| Continuidade | Destino de backup em outro domínio de falha, destinatário público age, custódia da chave de restauração, responsável e janela de manutenção |
| Recuperação | RPO e RTO aprovados e ensaio de restauração antes da entrada em produção |

## Preparação em máquina autorizada com internet

Requisitos deste pacote: Node 24, Python 3; no servidor: Docker/Compose, Nginx aprovado, Bash, GNU tar/coreutils e age. Obter a composição oficial do Supabase pelo guia abaixo, revisar mudanças, fixar seu commit e os digests das imagens. Não usar senhas de exemplo. O banco atual é PostgreSQL 17.6; testar compatibilidade de Auth/Storage e do esquema em uma instalação PostgreSQL 17 antes de restaurar dados.

1. Baixar e verificar os componentes locais:

```sh
python3 deploy/internal/download-assets.py /srv/preparacao/sst-ocr
```

2. No terminal autorizado, definir `SST_PUBLIC_ORIGIN` com a origem HTTPS interna, `SST_ANON_KEY` com **somente** a chave pública da instância interna e `SST_OCR_ASSETS` com o diretório anterior. Não colocar segredos em argumentos, Git ou no pacote web. Gerar em diretório novo:

```sh
node deploy/internal/build.cjs /srv/preparacao/sst-release-001
node deploy/internal/prepare-functions.cjs /srv/preparacao/sst-functions-001
```

O build produz apenas arquivos públicos, `release.json` com hashes e `csp.nginx.conf`. O nome de origem usado no teste é fictício e não é um servidor provisionado. A chave pública do teste também é fictícia.

3. Copiar as funções preparadas para `volumes/functions` da **nova** instância interna; não sobrescrever a instalação atual da nuvem. Configurar `SUPABASE_URL` do runtime para o gateway interno e as chaves server-side da nova instância exclusivamente no ambiente protegido. As funções usam o domínio interno em CORS; convites apontam para a raiz interna. A função `sst-usuarios` usa `npm:@supabase/supabase-js@2.95.0`: preparar o cache/empacotamento desse runtime e verificar inicialização com saída de internet bloqueada. O teste estático deste pacote não comprova inicialização offline das funções.

4. Na configuração oficial do Auth, apontar `SITE_URL` para a origem interna, URLs externas de API para a origem interna com `/backend`, e permitir somente os redirecionamentos internos necessários. Configurar SMTP e testar entrega de convite e recuperação. Gerar segredos próprios; sessões da nuvem não devem ser reutilizadas no ambiente interno. Manter verificação de JWT e validação do usuário ativo nas funções.

5. Transferir imagens e dependências aprovadas para o servidor. Configurar as variáveis de `compose.yaml`: imagem Nginx aprovada com digest SHA-256, IP LAN, diretório absoluto do release e certificados, nome da rede privada do backend contendo o alias `kong`. A composição disponibilizada inicia somente o frontend. O TI precisa restringir também as portas publicadas pela composição oficial do backend, inclusive painel e PostgreSQL. Não copiar a composição oficial sem revisar essas portas.

6. Validar a composição e a configuração Nginx em homologação antes de iniciar. O proxy expõe somente os prefixos Auth/REST/Storage/Functions. O destino de API é o gateway privado, sem alternativa automática de conexão com a nuvem. Servir `.mjs` e `.wasm` com MIME correto na imagem Nginx aprovada; confirmar carregamento no navegador.

## Migração: executar primeiro em instância descartável

Não executar restore no banco atual. Exportar roles, esquema e dados pelo procedimento oficial `supabase db dump`, preservando `auth.users`, UUIDs, perfis, políticas, funções, gatilhos, auditoria e versões dos relatórios. Os scripts SQL do repositório não substituem um dump completo do ambiente atual.

Os arquivos binários de Storage e as funções não são transportados pelo dump do banco. Transferir objetos separadamente, preservando bucket, caminhos e SHA-256 de `sst_document_files`. Anexos legados base64 seguem nos cadastros até a migração individual verificada. Não considerar só a quantidade de objetos como evidência: abrir e conferir o conteúdo pelos usuários autorizados no destino.

Executar `verify-database.sql` na origem e no destino e comparar as evidências durante uma janela sem escritas. Na conferência feita nesta etapa: 501 terceiros, 100 empresas, 3 contas/perfis, 1 exceção, 1 evento de auditoria, 1 versão de relatório, 0 novos arquivos privados e MD5 do estado `09b4838207580a1e4c1f7d49a4d19a4d`; RLS ativa nas seis tabelas verificadas. Isso é um marco observado, não uma constante para futuras migrações.

Testar os scripts de permissões e os 182 casos de regras do repositório na homologação; os scripts transacionais devem reverter as alterações de teste. Testar login dos mesmos usuários, consulta de portaria, cadastro, exceção, documentos, relatório por datas, celular, relógio alterado, queda da rede e recuperação de senha. Repetir a leitura de PDF/imagem com saída para a internet bloqueada. Ensaiar os horários de Brasília, NTP do servidor e restauração antes de marcar a etapa concluída.

## Backup e recuperação

`backup.sh` é um procedimento manual para a instância **self-hosted**, com as mesmas versões do conjunto de serviços. Não é ferramenta de migração da nuvem. Exige `SST_WRITES_FROZEN=yes` após suspender de fato as escritas por todos os clientes, APIs e tarefas, além de diretórios definidos e destinatário público age. A variável sozinha não suspende escritas. Sem essa janela, banco e arquivos podem representar momentos diferentes.

O conjunto contém dump do banco, roles, configuração/arquivos do backend e frontend, com hashes internos; a saída é criptografada com age e possui hash externo. Configurações e roles contêm segredos: o diretório temporário é restrito, a chave privada de restauração não deve ficar no servidor da aplicação e os arquivos descriptografados não podem ir ao Git. Guardar também imagens/digests e dependências para reconstruir as mesmas versões. O script não inclui as imagens Docker nem o certificado privado externo montado no frontend; o TI deve manter recuperação/custódia desses itens separadamente.

O script foi conferido por sintaxe e bloqueio de execução sem janela de escrita; **não foi executado no servidor real**. Docker e age não estão disponíveis neste ambiente. Não há backup real, agendamento ou restauração comprovados nesta etapa.

Para o ensaio, o TI deve verificar o hash externo, descriptografar em diretório restrito isolado, conferir `SHA256SUMS`, montar a mesma versão oficial vazia e restaurar roles/esquema/dados e os arquivos correspondentes. Executar novamente `verify-database.sql` e os testes funcionais. Medir o tempo, registrar evidência e só depois aprovar a política operacional. Não há comando automático de restauração destrutiva neste pacote.

## Corte e reversão

Somente após homologação: congelar escritas da origem, repetir exportação/conferência, migrar os objetos finais, apontar o acesso para o endereço interno e exigir novo login. Manter a origem preservada sem novas escritas durante a janela combinada. Se o destino receber novos registros, uma reversão exige reconciliar esses registros; simplesmente voltar o endereço causaria perda de alterações. Não operar duas bases graváveis em paralelo.

## Evidências e pendências

Testes locais: build integral usando os 18 componentes reais verificados; geração de CSP por hash, ausência de conexão com o projeto hospedado e de fontes externas no HTML; caminhos locais de leitura; recusa de chave privilegiada/HTTP; configuração isolada das funções; testes de segurança e relatórios existentes. A CI repete download verificado e build. Não houve ensaio Docker/Nginx, SMTP, carga, login real, leitura real no navegador interno, restore ou corte de tráfego.

Esta etapa está concluída apenas quanto à preparação do pacote. A implantação depende do servidor, DNS/certificado, rede e SMTP fornecidos pelo TI, seguida dos ensaios acima. As políticas de acesso forte/MFA, retenção, antivírus, monitoramento e resposta a incidentes ainda precisam de implantação e validação operacional.

## Referências oficiais consultadas

- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/local-installation.md
