#!/usr/bin/env bash
# =============================================================================
# PersonalAssistantForge — Setup 20 Parallel Git Worktrees
# Run from the main project directory: ./scripts/setup-worktrees.sh
# Creates 20 worktrees in a sibling directory: ../paf-workers/
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKERS_DIR="$(dirname "$PROJECT_ROOT")/paf-workers"
PROMPTS_DIR="$PROJECT_ROOT/prompts"

# Worker definitions: number, branch slug, prompt file
WORKERS=(
  "01:w01-database:worker-01-database.md"
  "02:w02-auth:worker-02-auth.md"
  "03:w03-entities:worker-03-entities.md"
  "04:w04-inbox:worker-04-inbox.md"
  "05:w05-calendar:worker-05-calendar.md"
  "06:w06-communication:worker-06-communication.md"
  "07:w07-decisions:worker-07-decisions.md"
  "08:w08-finance:worker-08-finance.md"
  "09:w09-knowledge:worker-09-knowledge.md"
  "10:w10-voiceforge:worker-10-voiceforge.md"
  "11:w11-voice-capture:worker-11-voice-capture.md"
  "12:w12-workflows:worker-12-workflows.md"
  "13:w13-execution:worker-13-execution.md"
  "14:w14-tasks:worker-14-tasks.md"
  "15:w15-security:worker-15-security.md"
  "16:w16-engines-abc:worker-16-engines-abc.md"
  "17:w17-engines-def:worker-17-engines-def.md"
  "18:w18-analytics:worker-18-analytics.md"
  "19:w19-life-modules:worker-19-life-modules.md"
  "20:w20-platform:worker-20-platform.md"
)

echo "============================================="
echo "  PersonalAssistantForge — Worktree Setup"
echo "  Creating 20 parallel development environments"
echo "============================================="
echo ""

# Create workers parent directory
mkdir -p "$WORKERS_DIR"
echo "[OK] Workers directory: $WORKERS_DIR"

cd "$PROJECT_ROOT"

# Ensure we're on main/master
MAIN_BRANCH=$(git branch --show-current)
echo "[OK] Base branch: $MAIN_BRANCH"
echo ""

# Create all worktrees
for worker in "${WORKERS[@]}"; do
  IFS=':' read -r NUM SLUG PROMPT <<< "$worker"
  BRANCH="ai-feature/$SLUG"
  WORKTREE_PATH="$WORKERS_DIR/worker-$NUM"

  if [ -d "$WORKTREE_PATH" ]; then
    echo "[SKIP] Worker $NUM already exists at $WORKTREE_PATH"
    continue
  fi

  # Create branch and worktree
  git branch "$BRANCH" 2>/dev/null || true
  git worktree add "$WORKTREE_PATH" "$BRANCH"

  # Copy the prompt file into the worktree for easy access
  if [ -f "$PROMPTS_DIR/$PROMPT" ]; then
    cp "$PROMPTS_DIR/$PROMPT" "$WORKTREE_PATH/WORKER_PROMPT.md"
  fi

  echo "[OK] Worker $NUM → $WORKTREE_PATH (branch: $BRANCH)"
done

echo ""
echo "============================================="
echo "  All 20 worktrees created!"
echo "============================================="
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/launch-workers.sh"
echo "     (Opens 20 terminals with Claude Code)"
echo ""
echo "  2. Or manually launch Claude Code in each:"
for worker in "${WORKERS[@]}"; do
  IFS=':' read -r NUM SLUG PROMPT <<< "$worker"
  echo "     cd $WORKERS_DIR/worker-$NUM && claude --print-prompt WORKER_PROMPT.md"
done
echo ""
echo "  3. After all workers finish:"
echo "     Run: ./scripts/merge-workers.sh"
