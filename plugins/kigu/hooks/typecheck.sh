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

# Lint only the edited file; report without rewriting it so Claude's view of
# the file stays in sync
if [ -f biome.json ] || [ -f biome.jsonc ]; then
  LINT_OUT=$(pnpm exec biome check "$FILE_PATH" 2>&1)
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

if [ -f "$DIR/tsconfig.json" ]; then
  # --skipLibCheck matches the stack's build:types convention (node_modules
  # declarations are not checkable with "types": [])
  TSC_OUT=$(cd "$DIR" && pnpm exec tsc --noEmit --skipLibCheck --pretty false 2>&1)
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
