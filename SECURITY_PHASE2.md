# SST — etapa 2

Implementação: 21/10/2026. A implantação atual continua em GitHub Pages e Supabase. A exigência de servidor interno da Tangará pertence à etapa seguinte; este trabalho não constitui homologação de produção.

## Comportamento entregue

- `sst_access_now`: decisão atual calculada no banco, com horário e data de Brasília do servidor, regra `sst-access-v1` e versão dos cadastros. Mesmas regras usadas no relatório histórico. ASO vencido ou ausente não pode ser substituído por exceção.
- A interface consulta novamente a cada 20 segundos. Confirmação expira em no máximo 30 segundos ou na virada do dia de Brasília, usando relógio monotônico. Edição local pendente, versão divergente, resposta tardia após sair/ocultar, falha de consulta e modo offline não autorizam liberação. A tela indica “NÃO CONFIRMADO”. Há uma janela de atualização de até 30 segundos entre consultas; não é controle físico de catraca nem registro de entrada.
- `sst-documentos`: endpoint autenticado, com verificação do usuário pelo Auth e permissões atuais no banco. Portaria não pode enviar nem baixar documentos. Bucket `sst-documentos` privado, sem políticas públicas e sem permissão de escrita direta do navegador. Credencial privilegiada existe somente no servidor.
- Novos arquivos ficam no Storage. O cadastro recebe referência, nome, MIME, tamanho e SHA-256. O servidor registra criador e horário. Download autenticado verifica tamanho e SHA-256; não utiliza links públicos ou assinados compartilháveis. Bytes e respostas não entram no cache do aplicativo.
- Validação no servidor: tamanho máximo 900.000 bytes, formatos PDF/PNG/JPEG/WEBP, assinatura inicial e extensão coerentes, recusa de padrões explícitos de PDF ativo. Isso não substitui antivírus, análise completa do formato ou conferência humana.
- Banco recusa datas impossíveis, coleções inválidas, IDs duplicados, novas inserções de base64 nas coleções documentais e referências de Storage incompatíveis com o proprietário e os metadados registrados. Exceções ativas exigem vigência, aprovador, motivo e lista de pendências.
- Alterações de cadastro, conferência, vínculo e remoção documental continuam passando pelo salvamento com motivo e auditoria existente. O evento do banco identifica o usuário real e o horário do servidor; campos informativos preenchidos no formulário não substituem essa evidência.

## Preservação e transição

Os 501 terceiros, 100 empresas e três anexos legados foram preservados, sem reescrever os bytes existentes. Os anexos antigos continuam legíveis pelo caminho compatível, protegidos pelas permissões de leitura da etapa 1. Novos anexos usam exclusivamente a área privada. Cada anexo antigo apresenta “Guardar na área privada” para um usuário com permissão de cadastro. Essa ação copia o arquivo, baixa a cópia para comparar os bytes e somente então propõe o vínculo novo pelo salvamento auditado. Cancelamento ou falha mantém o vínculo original. Não foi alegada migração concluída dos três arquivos antigos.

O endpoint não permite sobrescrever ou apagar objetos. Remover um anexo do cadastro remove o vínculo por alteração auditada; o arquivo fica retido. Envio que não chegar ao salvamento do vínculo pode deixar arquivo sem vínculo. Antes da produção, definir retenção e descarte com o responsável pelos dados e implementar limpeza controlada conforme essa decisão.

## Evidências de validação

- `npm test` em Node 24: proteção HTML/CSP/cache/sessão, navegação com backend simulado, salvamento auditado e relatórios anteriores; expiração monotônica, virada de Brasília, alterações locais, versões divergentes e respostas tardias; validação dos arquivos; execução do handler real de documentos com transportes Auth/Storage simulados, incluindo upload e download com verificação de integridade; migração de anexo legado no DOM com cópia verificada antes do novo vínculo e preservação do original em caso de divergência.
- `tests/phase2-permissions.sql` executado no banco real em transação revertida: estado legado ainda gravável, data inválida, IDs repetidos, base64 novo e referência falsa recusados; consulta oficial disponível à portaria e permissões documentais restritas.
- `node tests/access-parity.cjs` gera `tests/access-parity.sql`: 182 casos sintéticos executados no banco real com igualdade entre regras SQL e o avaliador histórico JavaScript, incluindo exceções vigentes, expiradas, revogadas e incompletas.
- Endpoint publicado exige JWT; requisição sem autorização recebeu HTTP 401.
- Fingerprint dos cadastros após testes: MD5 `09b4838207580a1e4c1f7d49a4d19a4d`, igual ao anterior. Os testes SQL não deixaram alterações nos dados reais.

## Limites e pendências para homologação

Ainda falta validar upload, visualização e download com sessão real de um usuário e com perfil real de portaria; o ensaio local não foi apresentado como esse teste. Sem credenciais do usuário, não foi feito login nem envio de emails de teste. Falta migrar os três anexos legados e validar visualmente os documentos reais após a cópia. A leitura/OCR e o visualizador PDF também precisam de ensaio em navegador autenticado e celular.

Permanecem da avaliação anterior: recuperação de backup testada, autenticação forte/MFA, proteção contra senhas comprometidas, política de retenção e resposta a incidentes, controles operacionais e implantação interna exigida pela Tangará. O alerta de senhas comprometidas está documentado em https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Operação e reversão

Migrações aditivas: `supabase/security-phase2-access.sql` e `supabase/security-phase2-documents.sql`. O segundo arquivo é de aplicação única, pois cria tabela, bucket, políticas e gatilhos. Para instalações novas, aplicar depois da etapa 1 e das migrações existentes de auditoria e relatórios.

Não voltar apenas o HTML para a versão anterior: o banco agora recusa novos arquivos base64. Em incidente, interromper novos envios e manter consulta/documentos privados; reverter código e banco de forma coordenada após identificar o defeito. Não remover tabela, bucket, arquivos ou auditoria para reverter a interface. Nenhum procedimento de reversão destrutivo foi executado.
