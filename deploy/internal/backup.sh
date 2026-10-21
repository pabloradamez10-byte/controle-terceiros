#!/usr/bin/env bash
# Self-hosted same-version recovery set. Run only on the internal server.
set -euo pipefail
umask 077
: "${SST_STACK_DIR:?Official Supabase stack directory}"
: "${SST_RELEASE_DIR:?Active frontend release directory}"
: "${SST_BACKUP_DIR:?Separate protected backup destination}"
: "${SST_BACKUP_RECIPIENT:?age public recipient}"
[[ ${SST_WRITES_FROZEN:-} == yes ]] || { echo 'Suspenda as escritas de todos os clientes, APIs e tarefas antes do backup.' >&2; exit 1; }
for tool in docker age tar sha256sum realpath; do command -v "$tool" >/dev/null; done
[[ -d "$SST_STACK_DIR/volumes/storage" && -f "$SST_STACK_DIR/.env" && -f "$SST_RELEASE_DIR/release.json" ]]
mkdir -p "$SST_BACKUP_DIR"
stack_path=$(realpath "$SST_STACK_DIR")
backup_path=$(realpath "$SST_BACKUP_DIR")
[[ "$backup_path" != "$stack_path" && "$backup_path" != "$stack_path/"* ]] || { echo 'Backup deve ficar fora do diretório da aplicação.' >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$SST_BACKUP_DIR/sst-$stamp.tar.age"
[[ ! -e "$target" ]] || { echo 'Destino já existe.' >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
docker compose --project-directory "$SST_STACK_DIR" exec -T db pg_dump -U postgres -Fc postgres > "$tmp/database.dump"
docker compose --project-directory "$SST_STACK_DIR" exec -T db pg_dumpall -U postgres --roles-only > "$tmp/roles.sql"
[[ -s "$tmp/database.dump" && -s "$tmp/roles.sql" ]]
# This configuration contains secrets; it is only included inside the encrypted set.
tar -C "$SST_STACK_DIR" --exclude='./volumes/db/data' --exclude='./.git' -cf "$tmp/stack-files.tar" .
tar -C "$SST_RELEASE_DIR" -cf "$tmp/frontend.tar" .
cp "$SST_RELEASE_DIR/release.json" "$tmp/release.json"
(cd "$tmp" && sha256sum database.dump roles.sql stack-files.tar frontend.tar release.json > SHA256SUMS)
tar -C "$tmp" -cf - . | age -r "$SST_BACKUP_RECIPIENT" -o "$target.partial"
mv -- "$target.partial" "$target"
sha256sum "$target" > "$target.sha256"
echo 'Backup criptografado criado. A restauração deve ser ensaiada em ambiente isolado.'
