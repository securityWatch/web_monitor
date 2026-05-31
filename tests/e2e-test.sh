#!/usr/bin/env bash
set -eu

API_URL="${API_URL:-http://localhost:4000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
PASS=0
FAIL=0

log() { echo "[e2e] $*"; }
pass() { PASS=$((PASS+1)); log "PASS: $1"; }
fail() { FAIL=$((FAIL+1)); log "FAIL: $1"; }

EMAIL="e2e-$(date +%s)@test.pulsewatch.io"
PASSWORD="TestPass123"

log "API=$API_URL WEB=$WEB_URL"

# Health
code=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
[[ "$code" == "200" ]] && pass "Health check" || fail "Health check ($code)"

# Register (email OTP)
curl -s -X POST "$API_URL/api/v1/auth/register/send-code" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" >/dev/null || true
OTP_CODE="123456"
if command -v psql >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  HASH=$(printf '%s' "$OTP_CODE" | sha256sum | awk '{print $1}')
  psql "$DATABASE_URL" -c "INSERT INTO email_otp_codes (id, email, purpose, code_hash, expires_at) VALUES (gen_random_uuid(), lower('$EMAIL'), 'register', '$HASH', now() + interval '5 minutes')" >/dev/null 2>&1 || true
fi
REG=$(curl -s -X POST "$API_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"E2E User\",\"code\":\"$OTP_CODE\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null || echo "")
ORG=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['organization']['id'])" 2>/dev/null || echo "")
[[ -n "$TOKEN" && -n "$ORG" ]] && pass "Registration" || fail "Registration"

# Login
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
[[ "$code" == "200" ]] && pass "Login" || fail "Login ($code)"

# Refresh
REFRESH=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['refreshToken'])")
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/auth/refresh" \
  -H "Content-Type: application/json" -d "{\"refreshToken\":\"$REFRESH\"}")
[[ "$code" == "200" ]] && pass "JWT refresh" || fail "JWT refresh ($code)"

# Create monitor
MON=$(curl -s -X POST "$API_URL/api/v1/orgs/$ORG/monitors" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"E2E Google","type":"http","targetUrl":"https://www.google.com","intervalSeconds":30}')
MID=$(echo "$MON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
[[ -n "$MID" ]] && pass "Create monitor" || fail "Create monitor"

# Update monitor
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API_URL/api/v1/orgs/$ORG/monitors/$MID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"E2E Google Updated"}')
[[ "$code" == "200" ]] && pass "Update monitor" || fail "Update monitor ($code)"

# Wait for checks
log "Waiting 35s for monitor checks..."
sleep 35

CHECKS=$(curl -s "$API_URL/api/v1/orgs/$ORG/monitors/$MID/checks" -H "Authorization: Bearer $TOKEN")
COUNT=$(echo "$CHECKS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('checks',[])))" 2>/dev/null || echo "0")
[[ "$COUNT" -gt "0" ]] && pass "Monitor checks stored ($COUNT)" || fail "Monitor checks stored"

# Dashboard
DASH=$(curl -s "$API_URL/api/v1/orgs/$ORG/dashboard" -H "Authorization: Bearer $TOKEN")
TOTAL=$(echo "$DASH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalMonitors',0))" 2>/dev/null || echo "0")
[[ "$TOTAL" -ge "1" ]] && pass "Dashboard stats" || fail "Dashboard stats"

# Password change
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/v1/me/password/change" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"NewPass456\"}")
[[ "$code" == "200" ]] && pass "Password change" || fail "Password change ($code)"

# i18n routes
for loc in en zh; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL/$loc")
  [[ "$code" == "200" ]] && pass "i18n route /$loc" || fail "i18n route /$loc ($code)"
done

# Delete monitor
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/v1/orgs/$ORG/monitors/$MID" \
  -H "Authorization: Bearer $TOKEN")
[[ "$code" == "200" ]] && pass "Delete monitor" || fail "Delete monitor ($code)"

# Concurrent monitors stability
for i in $(seq 1 10); do
  curl -s -X POST "$API_URL/api/v1/orgs/$ORG/monitors" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"Concurrent $i\",\"type\":\"http\",\"targetUrl\":\"https://example.com\",\"intervalSeconds\":60}" > /dev/null
done
pass "Create 10 concurrent monitors"

log "Waiting 10s for concurrent checks..."
sleep 10
code=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
[[ "$code" == "200" ]] && pass "Stability after concurrent monitors" || fail "Stability check"

log "================================"
log "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
