#!/usr/bin/env bash
# =============================================================================
# PersonalAssistantForge — Cleanup Worktrees After Merge
# Removes all 20 worktrees and optionally deletes feature branches.
# Run AFTER merge-workers.sh completes successfully.
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKERS_DIR="$(dirname "$PROJECT_ROOT")/paf-workers"

cd "$PROJECT_ROOT"

echo "============================================="
echo "  Cleaning up worktrees and branches"
echo "============================================="

# Remove worktrees
for i in $(seq -w 1 20); do
  WORKTREE="$WORKERS_DIR/worker-$i"
  if [ -d "$WORKTREE" ]; then
    git worktree remove "$WORKTREE" --force 2>/dev/null || true
    echo "[OK] Removed worktree: worker-$i"
  fi
done

# Remove workers directory if empty
rmdir "$WORKERS_DIR" 2>/dev/null && echo "[OK] Removed $WORKERS_DIR" || true

# Prune worktree references
git worktree prune
echo "[OK] Pruned stale worktree references"

# Optionally delete feature branches
echo ""
read -p "Delete all ai-feature/* branches? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  for branch in $(git branch --list "ai-feature/*"); do
    branch=$(echo "$branch" | tr -d '[:space:]')
    git branch -D "$branch" 2>/dev/null && echo "[OK] Deleted branch: $branch" || true
  done
  echo "[OK] All feature branches deleted"
else
  echo "[SKIP] Branches preserved"
fi

echo ""
echo "Cleanup complete!"
