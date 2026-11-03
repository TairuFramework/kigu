#!/bin/bash
# PostToolUse hook: lint + type-check after TypeScript edits in stack repos.
# Reports issues back to Claude via additionalContext (plain stdout on exit 0
# is NOT fed to the model for PostToolUse hooks).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check TypeScript files in a pnpm project
[[ "$FILE_PATH" =~ \.(ts|tsx)$ ]] || exit 0
[ -f "$CLAUDE_PROJECT_DIR/package.json" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

ISSUES=""

# Resolve a tool from the nearest node_modules/.bin above a directory. Never
# go through pnpm: inside a repo checked out within another pnpm workspace
# (e.g. a Yosura stack worktree), `pnpm exec` sees the inner workspace, finds
# no install, and auto-installs a standalone copy that breaks the outer one.
find_bin() {
  local dir="$1"
  while [ "$dir" != "/" ]; do
    [ -x "$dir/node_modules/.bin/$2" ] && echo "$dir/node_modules/.bin/$2" && return 0
    dir=$(dirname "$dir")
  done
  return 1
}

# Lint only the edited file, from the folder holding its nearest biome config;
# report without rewriting it so Claude's view of the file stays in sync
BIOME_DIR=$(dirname "$FILE_PATH")
while [ "$BIOME_DIR" != "/" ] && [ ! -f "$BIOME_DIR/biome.json" ] && [ ! -f "$BIOME_DIR/biome.jsonc" ]; do
  BIOME_DIR=$(dirname "$BIOME_DIR")
done
BIOME=$(find_bin "$(dirname "$FILE_PATH")" biome)
if [ "$BIOME_DIR" != "/" ] && [ -n "$BIOME" ]; then
  LINT_OUT=$(cd "$BIOME_DIR" && "$BIOME" check "$FILE_PATH" 2>&1)
  if [ $? -ne 0 ]; then
    ISSUES="=== Lint (biome check) ===
$(echo "$LINT_OUT" | head -40)
"
  fi
fi

# Find nearest tsconfig.json (package boundary) for scoped type-check
DIR=$(dirname "$FILE_PATH")
while [ "$DIR" != "/" ] && [ ! -f "$DIR/tsconfig.json" ]; do
  DIR=$(dirname "$DIR")
done

TSC=$(find_bin "$DIR" tsc)
if [ -f "$DIR/tsconfig.json" ] && [ -n "$TSC" ]; then
  # --skipLibCheck matches the stack's build:types convention (node_modules
  # declarations are not checkable with "types": [])
  TSC_OUT=$(cd "$DIR" && "$TSC" --noEmit --skipLibCheck --pretty false 2>&1)
  if [ $? -ne 0 ]; then
    ISSUES="$ISSUES=== Type errors ($DIR) ===
$(echo "$TSC_OUT" | head -40)
"
  fi
fi

[ -z "$ISSUES" ] && exit 0

jq -n --arg ctx "$ISSUES" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
exit 0
