#!/usr/bin/env bash
# =============================================================================
# PersonalAssistantForge — Merge All 20 Worker Branches
# Run from the main project directory: ./scripts/merge-workers.sh
#
# Strategy: Merge each worker branch sequentially into main.
# Since each worker owns exclusive file paths, conflicts should be minimal.
# If conflicts occur, they're logged and the script pauses for resolution.
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKERS_DIR="$(dirname "$PROJECT_ROOT")/paf-workers"
LOG_FILE="$PROJECT_ROOT/logs/merge.log"
mkdir -p "$(dirname "$LOG_FILE")"

BRANCHES=(
  "ai-feature/w01-database"
  "ai-feature/w02-auth"
  "ai-feature/w03-entities"
  "ai-feature/w04-inbox"
  "ai-feature/w05-calendar"
  "ai-feature/w06-communication"
  "ai-feature/w07-decisions"
  "ai-feature/w08-finance"
  "ai-feature/w09-knowledge"
  "ai-feature/w10-voiceforge"
  "ai-feature/w11-voice-capture"
  "ai-feature/w12-workflows"
  "ai-feature/w13-execution"
  "ai-feature/w14-tasks"
  "ai-feature/w15-security"
  "ai-feature/w16-engines-abc"
  "ai-feature/w17-engines-def"
  "ai-feature/w18-analytics"
  "ai-feature/w19-life-modules"
  "ai-feature/w20-platform"
)

cd "$PROJECT_ROOT"

echo "=============================================" | tee "$LOG_FILE"
echo "  PersonalAssistantForge — Branch Integration" | tee -a "$LOG_FILE"
echo "  Merging 20 worker branches into main" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Ensure clean working directory
if [ -n "$(git status --porcelain)" ]; then
  echo "[ERROR] Working directory not clean. Commit or stash changes first." | tee -a "$LOG_FILE"
  exit 1
fi

MAIN_BRANCH=$(git branch --show-current)
echo "[OK] On branch: $MAIN_BRANCH" | tee -a "$LOG_FILE"

MERGED=0
FAILED=0
SKIPPED=0

for BRANCH in "${BRANCHES[@]}"; do
  echo "" | tee -a "$LOG_FILE"
  echo "--- Merging: $BRANCH ---" | tee -a "$LOG_FILE"

  # Check if branch exists
  if ! git rev-parse --verify "$BRANCH" &>/dev/null; then
    echo "[SKIP] Branch $BRANCH does not exist" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Check if branch has commits ahead of main
  AHEAD=$(git rev-list "$MAIN_BRANCH".."$BRANCH" --count 2>/dev/null || echo "0")
  if [ "$AHEAD" = "0" ]; then
    echo "[SKIP] $BRANCH has no new commits" | tee -a "$LOG_FILE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "[INFO] $BRANCH has $AHEAD commits to merge" | tee -a "$LOG_FILE"

  # Attempt merge
  if git merge "$BRANCH" --no-edit -m "merge: integrate $BRANCH into $MAIN_BRANCH" 2>>"$LOG_FILE"; then
    echo "[OK] Merged $BRANCH successfully" | tee -a "$LOG_FILE"
    MERGED=$((MERGED + 1))
  else
    echo "[CONFLICT] Merge conflict in $BRANCH" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    # Show conflicted files
    echo "Conflicted files:" | tee -a "$LOG_FILE"
    git diff --name-only --diff-filter=U | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    # Attempt auto-resolution: prefer the incoming branch for new files
    CONFLICTED_FILES=$(git diff --name-only --diff-filter=U)
    AUTO_RESOLVED=true

    for f in $CONFLICTED_FILES; do
      # If file only exists in the branch (new file), accept theirs
      if ! git show "$MAIN_BRANCH:$f" &>/dev/null 2>&1; then
        git checkout --theirs "$f"
        git add "$f"
        echo "[AUTO] Accepted theirs for new file: $f" | tee -a "$LOG_FILE"
      else
        AUTO_RESOLVED=false
        echo "[MANUAL] Needs manual resolution: $f" | tee -a "$LOG_FILE"
      fi
    done

    if [ "$AUTO_RESOLVED" = true ]; then
      git commit --no-edit
      echo "[OK] Auto-resolved and merged $BRANCH" | tee -a "$LOG_FILE"
      MERGED=$((MERGED + 1))
    else
      echo "" | tee -a "$LOG_FILE"
      echo "[PAUSE] Manual resolution needed for $BRANCH" | tee -a "$LOG_FILE"
      echo "  1. Resolve conflicts in the files listed above" | tee -a "$LOG_FILE"
      echo "  2. Run: git add . && git commit --no-edit" | tee -a "$LOG_FILE"
      echo "  3. Re-run this script to continue remaining merges" | tee -a "$LOG_FILE"
      FAILED=$((FAILED + 1))

      # Abort this merge so user can fix manually
      git merge --abort
      echo "[INFO] Merge aborted. Fix conflicts and re-run." | tee -a "$LOG_FILE"
    fi
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"
echo "  MERGE SUMMARY" | tee -a "$LOG_FILE"
echo "  Merged:  $MERGED / ${#BRANCHES[@]}" | tee -a "$LOG_FILE"
echo "  Skipped: $SKIPPED" | tee -a "$LOG_FILE"
echo "  Failed:  $FAILED" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"

if [ "$FAILED" -eq 0 ] && [ "$MERGED" -gt 0 ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "All branches merged! Next steps:" | tee -a "$LOG_FILE"
  echo "  1. Run tests:    npm test" | tee -a "$LOG_FILE"
  echo "  2. Build:        npm run build" | tee -a "$LOG_FILE"
  echo "  3. Fix issues:   (if any)" | tee -a "$LOG_FILE"
  echo "  4. Clean up:     ./scripts/cleanup-worktrees.sh" | tee -a "$LOG_FILE"
fi
