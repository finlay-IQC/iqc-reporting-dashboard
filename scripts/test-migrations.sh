#!/usr/bin/env bash
# Applies the migrations + seed to a throwaway local Postgres and runs sanity
# checks. Stubs the bits of Supabase's `auth` schema the migration relies on.
# Usage: npm run db:test   (needs Postgres binaries; set PG_BIN if not on PATH)
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown postgres "$DATA"; RUN_AS=(runuser -u postgres --); fi
cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -w start >/dev/null
PSQL=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
SQL

for f in supabase/migrations/*.sql; do echo "→ $f"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -c "grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;"
echo "→ supabase/seed.sql (twice, to prove it is re-runnable)"; "${PSQL[@]}" -f supabase/seed.sql >/dev/null; "${PSQL[@]}" -f supabase/seed.sql

"${PSQL[@]}" -f scripts/sql/sanity-checks.sql
echo "✓ migrations, seed and sanity checks passed"
