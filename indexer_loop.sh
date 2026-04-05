#!/usr/bin/env bash
# ============================================================
# ConsultX — Full GraphRAG Indexing Orchestrator
# Target : 4,630 SBC chunks  |  Batch: 2/call
# Milestones: communities rebuild every 500 chunks
# ============================================================

SUPABASE_URL="https://hrnltxmwoaphgejckutk.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhybmx0eG13b2FwaGdlamNrdXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjI1MDYsImV4cCI6MjA4NTY5ODUwNn0.eeODoyolv0eXg42xJ-rAUzIs_CjcUWNu2sx5LABuIiE"
INDEX_URL="${SUPABASE_URL}/functions/v1/sbc-graph-indexer"
LOG_FILE="/d/ConsultX_Clean/indexer_loop.log"
BATCH_SIZE=2
MILESTONE=500     # call communities every N chunks
REPORT_EVERY=100  # print progress banner every N chunks

total_processed=0
total_nodes=0
total_edges=0
milestone_counter=0
call_number=0
consecutive_errors=0
MAX_CONSECUTIVE_ERRORS=5

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

call_indexer() {
  local action="$1"
  curl -s -m 120 -X POST "$INDEX_URL" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"$action\"}"
}

log "======================================================"
log " ConsultX Full GraphRAG Indexing Loop — START"
log " Target: 4,630 chunks | Batch: ${BATCH_SIZE}/call"
log " Milestone (communities): every ${MILESTONE} chunks"
log "======================================================"

while true; do
  call_number=$((call_number + 1))
  response=$(call_indexer "index")

  # Check for curl/network failure
  if [ -z "$response" ]; then
    consecutive_errors=$((consecutive_errors + 1))
    log "⚠️  Call #${call_number}: empty response (network error) — skip [${consecutive_errors}/${MAX_CONSECUTIVE_ERRORS}]"
    if [ "$consecutive_errors" -ge "$MAX_CONSECUTIVE_ERRORS" ]; then
      log "❌ ${MAX_CONSECUTIVE_ERRORS} consecutive network errors — aborting loop"
      exit 1
    fi
    sleep 10
    continue
  fi

  # Parse JSON fields
  success=$(echo "$response"    | grep -o '"success":[^,}]*'    | cut -d: -f2 | tr -d ' "')
  nodes=$(echo "$response"      | grep -o '"nodes_created":[0-9]*'  | grep -o '[0-9]*')
  edges=$(echo "$response"      | grep -o '"edges_created":[0-9]*'  | grep -o '[0-9]*')
  processed=$(echo "$response"  | grep -o '"processed_this_call":[0-9]*' | grep -o '[0-9]*')
  message=$(echo "$response"    | grep -o '"message":"[^"]*"'   | cut -d'"' -f4)
  err_field=$(echo "$response"  | grep -o '"error":"[^"]*"'     | cut -d'"' -f4)

  # Detect fatal error from edge function
  if [ -n "$err_field" ]; then
    consecutive_errors=$((consecutive_errors + 1))
    log "⚠️  Call #${call_number}: ERROR — ${err_field} [${consecutive_errors}/${MAX_CONSECUTIVE_ERRORS}]"
    if [ "$consecutive_errors" -ge "$MAX_CONSECUTIVE_ERRORS" ]; then
      log "❌ Too many consecutive errors — aborting"
      exit 1
    fi
    sleep 15
    continue
  fi

  # Successful batch
  consecutive_errors=0
  nodes=${nodes:-0}
  edges=${edges:-0}
  processed=${processed:-0}

  total_processed=$((total_processed + processed))
  total_nodes=$((total_nodes + nodes))
  total_edges=$((total_edges + edges))
  milestone_counter=$((milestone_counter + processed))

  log "✅ Call #${call_number} | +${processed} chunks | +${nodes} nodes | +${edges} edges | total=${total_processed}"

  # ── Detect completion ──────────────────────────────────────────────────────
  if echo "$message" | grep -q "All chunks indexed"; then
    log ""
    log "🎉 ALL CHUNKS INDEXED!"
    log "   Total processed : ${total_processed}"
    log "   Total nodes      : ${total_nodes}"
    log "   Total edges      : ${total_edges}"
    log ""
    log "🔗 Building final community summaries..."
    communities_response=$(call_indexer "communities")
    log "Communities response: $communities_response"
    log "✅ FULL INDEXING COMPLETE"
    exit 0
  fi

  # ── Progress report every 100 chunks ──────────────────────────────────────
  if [ $((total_processed % REPORT_EVERY)) -lt "$BATCH_SIZE" ] && [ "$total_processed" -gt 0 ]; then
    remaining=$((4630 - total_processed))
    pct=$(( (total_processed * 100) / 4630 ))
    log ""
    log "  ┌─────────────────────────────────────────┐"
    log "  │ PROGRESS REPORT @ ${total_processed} chunks"
    log "  │ Nodes  : ${total_nodes}  |  Edges: ${total_edges}"
    log "  │ Done   : ${pct}%  |  Remaining: ~${remaining}"
    log "  └─────────────────────────────────────────┘"
    log ""
  fi

  # ── Milestone: rebuild communities every 500 chunks ───────────────────────
  if [ "$milestone_counter" -ge "$MILESTONE" ]; then
    milestone_counter=0
    log ""
    log "🔗 MILESTONE @ ${total_processed} chunks — rebuilding community summaries..."
    c_resp=$(call_indexer "communities")
    c_built=$(echo "$c_resp" | grep -o '"communities_built":[0-9]*' | grep -o '[0-9]*')
    log "   Communities built: ${c_built:-unknown}"
    log ""
  fi

  # Brief pause between calls (rate-limit buffer)
  sleep 2
done
