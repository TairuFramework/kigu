#!/bin/bash
# PreToolUse hook: block in-place sed on macOS. BSD sed treats the -i argument
# as a backup suffix and lacks \b word boundaries, so GNU-style invocations
# silently no-op — codemods appear to succeed while changing nothing.

[ "$(uname)" = "Darwin" ] || exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -Eq '(^|[[:space:];&|])sed[[:space:]]+(-[A-Za-z]*i|--in-place)'; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "In-place sed is unreliable on macOS (BSD sed: -i takes a backup suffix, no \\b support, silent no-ops). Use perl -pi -e, a Node codemod, or the Edit tool instead."}}'
fi
exit 0
