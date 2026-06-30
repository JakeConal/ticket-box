#!/usr/bin/env sh
set -eu

DB_SERVICE="${DB_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-ticketbox}"
POSTGRES_DB="${POSTGRES_DB:-ticketbox}"

sql() {
  docker compose exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"
}

assert_eq() {
  expected="$1"
  actual="$2"
  label="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL $label: expected $expected, got $actual" >&2
    exit 1
  fi
  echo "OK $label: $actual"
}

event_filter="'ATSH-HCM-2026','ATVNCG-HN-2026','EXSH-HCM-2026','CDDG-HN-2026'"

assert_eq "4" "$(sql "select count(*) from concerts where status = 'PUBLISHED' and event_code in ($event_filter);")" "published concerts"
assert_eq "4" "$(sql "select count(*) from concerts where (event_code, name) in (('ATSH-HCM-2026', 'Anh Trai Say Hi'), ('ATVNCG-HN-2026', 'Anh Trai Vượt Ngàn Chông Gai'), ('EXSH-HCM-2026', 'Em Xinh Say Hi'), ('CDDG-HN-2026', 'Chị Đẹp Đạp Gió Rẽ Sóng'));")" "concert names"
assert_eq "4" "$(sql "select count(*) from concerts where event_code in ($event_filter) and artist_bio is not null and bio_status = 'PUBLISHED';")" "published bios"
assert_eq "20" "$(sql "select count(*) from ticket_types where concert_id in (select id from concerts where event_code in ($event_filter));")" "ticket types"
assert_eq "4" "$(sql "select count(*) from ticket_types where name = 'SVIP' and total_quantity = 200 and per_user_limit = 2 and price = 3500000.00;")" "SVIP baselines"
assert_eq "6" "$(sql "select count(*) from users where email in ('organizer@ticketbox.vn','checker1@ticketbox.vn','checker2@ticketbox.vn','audience1@ticketbox.vn','audience2@ticketbox.vn','audience3@ticketbox.vn');")" "seed accounts"
assert_eq "8" "$(sql "select count(*) from checker_gate_assignments where concert_id in (select id from concerts where event_code in ($event_filter));")" "checker gate assignments"

if [ ! -f "import-samples/vip-guests-sample.csv" ]; then
  echo "FAIL sample VIP CSV missing" >&2
  exit 1
fi

echo "OK sample VIP CSV: import-samples/vip-guests-sample.csv"
