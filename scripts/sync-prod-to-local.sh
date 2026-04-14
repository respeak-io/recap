#!/usr/bin/env bash
# Sync production Supabase data into the local Supabase dev database.
#
# Prerequisites:
#   - Local Supabase is running:        npx supabase start
#   - CLI is linked to the prod project: npx supabase link --project-ref <ref>
#
# What it does:
#   1. Resets the local DB (re-applies all migrations from scratch)
#   2. Dumps prod data (data only — schema comes from local migrations)
#   3. Loads the dump into local
#   4. Removes the dump file (always, even on failure)
#
# Caveats:
#   - auth.users is included by default. To exclude, edit DUMP_FLAGS below.
#   - storage.objects rows are imported, but the underlying files live in
#     prod's S3 — image/video URLs will 404 locally.
#   - The articles fts trigger fires during COPY import, so fts is rebuilt
#     correctly with the current schema. No manual backfill needed.

set -euo pipefail

DUMP_FILE="prod-data.sql"
DUMP_FLAGS=(--linked --data-only)
# To exclude prod auth users (and use a local test user instead), uncomment:
# DUMP_FLAGS+=(--exclude-schema=auth)
# To exclude storage rows (avoids 404 references for missing files):
# DUMP_FLAGS+=(--exclude-schema=storage)

cleanup() {
  if [ -f "$DUMP_FILE" ]; then
    rm -f "$DUMP_FILE"
    echo "Removed $DUMP_FILE"
  fi
}
trap cleanup EXIT

echo "==> Resetting local DB to clean schema..."
npx supabase db reset

echo "==> Dumping prod data..."
npx supabase db dump "${DUMP_FLAGS[@]}" -f "$DUMP_FILE"

echo "==> Loading into local..."
LOCAL_DB_URL=$(npx supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')
psql "$LOCAL_DB_URL" -f "$DUMP_FILE" >/dev/null

echo "==> Done. Local DB now mirrors prod."
