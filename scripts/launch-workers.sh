#!/usr/bin/env bash
# =============================================================================
# PersonalAssistantForge — Launch 20 Claude Code Instances
# Run from the main project directory: ./scripts/launch-workers.sh
#
# This script launches Claude Code in headless mode for each worktree.
# Each instance reads its WORKER_PROMPT.md and works autonomously.
#
# Options:
#   --interactive   Open separate terminal windows instead of headless
#   --workers 1,5,9 Only launch specific workers (comma-separated)
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKERS_DIR="$(dirname "$PROJECT_ROOT")/paf-workers"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

MODE="headless"
SELECTED_WORKERS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --interactive) MODE="interactive"; shift ;;
    --workers) SELECTED_WORKERS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

WORKER_NUMS=(01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20)

# Filter if specific workers requested
if [ -n "$SELECTED_WORKERS" ]; then
  IFS=',' read -ra WORKER_NUMS <<< "$SELECTED_WORKERS"
fi

echo "============================================="
echo "  Launching Claude Code Workers ($MODE mode)"
echo "  Workers: ${WORKER_NUMS[*]}"
echo "============================================="
echo ""

PIDS=()

for NUM in "${WORKER_NUMS[@]}"; do
  # Pad to 2 digits
  PADDED=$(printf "%02d" "$NUM")
  WORKTREE="$WORKERS_DIR/worker-$PADDED"

  if [ ! -d "$WORKTREE" ]; then
    echo "[SKIP] Worker $PADDED — worktree not found at $WORKTREE"
    continue
  fi

  PROMPT_FILE="$WORKTREE/WORKER_PROMPT.md"
  if [ ! -f "$PROMPT_FILE" ]; then
    echo "[SKIP] Worker $PADDED — no WORKER_PROMPT.md found"
    continue
  fi

  PROMPT_CONTENT=$(cat "$PROMPT_FILE")

  if [ "$MODE" = "headless" ]; then
    LOG_FILE="$LOG_DIR/worker-$PADDED.log"
    echo "[LAUNCH] Worker $PADDED (headless) → log: $LOG_FILE"

    # Launch Claude Code in headless mode
    (cd "$WORKTREE" && claude -p "$PROMPT_CONTENT" > "$LOG_FILE" 2>&1) &
    PIDS+=($!)

  elif [ "$MODE" = "interactive" ]; then
    echo "[LAUNCH] Worker $PADDED (interactive terminal)"

    # Windows Terminal (wt) — open new tab
    if command -v wt.exe &>/dev/null; then
      wt.exe new-tab --title "Worker $PADDED" -d "$WORKTREE" bash -c "claude" &
    # Git Bash / mintty fallback
    elif command -v mintty &>/dev/null; then
      mintty -t "Worker $PADDED" -e bash -c "cd '$WORKTREE' && claude" &
    # Generic fallback
    else
      start bash -c "cd '$WORKTREE' && claude" &
    fi
  fi

  # Small delay to avoid overwhelming the system
  sleep 2
done

echo ""

if [ "$MODE" = "headless" ]; then
  echo "============================================="
  echo "  ${#PIDS[@]} workers launched in headless mode"
  echo "  Logs: $LOG_DIR/worker-*.log"
  echo "============================================="
  echo ""
  echo "Monitor progress:"
  echo "  tail -f $LOG_DIR/worker-01.log"
  echo "  ls -la $LOG_DIR/"
  echo ""
  echo "Wait for all to complete:"
  echo "  wait ${PIDS[*]}"
  echo ""

  # Wait for all background processes
  echo "Waiting for all workers to finish..."
  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || echo "[WARN] Worker PID $pid exited with error"
  done

  echo ""
  echo "============================================="
  echo "  All workers complete!"
  echo "  Run: ./scripts/merge-workers.sh"
  echo "============================================="

else
  echo "============================================="
  echo "  ${#WORKER_NUMS[@]} interactive terminals launched"
  echo "  Paste each worker's prompt from WORKER_PROMPT.md"
  echo "  When all finish: ./scripts/merge-workers.sh"
  echo "============================================="
fi
