#!/bin/bash
sudo -u postgres psql -p 6541 -d pulsewatch -c "SELECT id, name, status, interval_seconds, last_checked_at, last_response_ms, next_run_at FROM monitors ORDER BY created_at DESC LIMIT 5;"
sudo -u postgres psql -p 6541 -d pulsewatch -c "SELECT monitor_id, COUNT(*) AS cnt, MAX(checked_at) AS latest FROM check_results GROUP BY monitor_id;"
sudo -u postgres psql -p 6541 -d pulsewatch -c "SELECT checked_at, response_ms, is_up FROM check_results ORDER BY checked_at DESC LIMIT 10;"
