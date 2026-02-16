#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKERS_DIR="$(dirname "$PROJECT_ROOT")/paf-workers-p2"
PROMPTS_DIR="$PROJECT_ROOT/prompts"

WORKERS=(
  "01:p2-w01-app-shell:p2-worker-01-app-shell.md"
  "02:p2-w02-dashboard-layout:p2-worker-02-dashboard-layout.md"
  "03:p2-w03-error-loading:p2-worker-03-error-loading.md"
  "04:p2-w04-middleware:p2-worker-04-middleware-config.md"
  "05:p2-w05-ai-library:p2-worker-05-ai-library.md"
  "06:p2-w06-email-sms:p2-worker-06-email-sms.md"
  "07:p2-w07-storage-payments:p2-worker-07-storage-payments.md"
  "08:p2-w08-search-realtime:p2-worker-08-search-realtime.md"
  "09:p2-w09-database:p2-worker-09-database.md"
  "10:p2-w10-cicd-docker:p2-worker-10-cicd-docker.md"
  "11:p2-w11-bg-jobs:p2-worker-11-bg-jobs.md"
  "12:p2-w12-wire-inbox-comm:p2-worker-12-wire-inbox-comm.md"
  "13:p2-w13-wire-cal-decisions:p2-worker-13-wire-cal-decisions.md"
  "14:p2-w14-wire-tasks-workflows:p2-worker-14-wire-tasks-workflows.md"
  "15:p2-w15-wire-exec-security:p2-worker-15-wire-exec-security.md"
  "16:p2-w16-wire-analytics:p2-worker-16-wire-analytics.md"
  "17:p2-w17-wire-life:p2-worker-17-wire-life.md"
  "18:p2-w18-wire-platform:p2-worker-18-wire-platform.md"
  "19:p2-w19-wire-engines:p2-worker-19-wire-engines.md"
  "20:p2-w20-missing-routes:p2-worker-20-missing-routes.md"
)

echo "============================================="
echo "  Phase 2 — Worktree Setup (20 workers)"
echo "============================================="

mkdir -p "$WORKERS_DIR"
cd "$PROJECT_ROOT"

MAIN_BRANCH=$(git branch --show-current)
echo "[OK] Base branch: $MAIN_BRANCH"

for worker in "${WORKERS[@]}"; do
  IFS=':' read -r NUM SLUG PROMPT <<< "$worker"
  BRANCH="ai-feature/$SLUG"
  WORKTREE_PATH="$WORKERS_DIR/worker-$NUM"

  if [ -d "$WORKTREE_PATH" ]; then
    echo "[SKIP] Worker $NUM already exists"
    continue
  fi

  git branch "$BRANCH" 2>/dev/null || true
  git worktree add "$WORKTREE_PATH" "$BRANCH"

  if [ -f "$PROMPTS_DIR/$PROMPT" ]; then
    cp "$PROMPTS_DIR/$PROMPT" "$WORKTREE_PATH/WORKER_PROMPT.md"
  fi

  echo "[OK] Worker $NUM → $WORKTREE_PATH (branch: $BRANCH)"
done

echo ""
echo "All 20 Phase 2 worktrees created!"
