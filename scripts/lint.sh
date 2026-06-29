#!/bin/bash
# Wrapper for biome check that fails on ANY diagnostic (info, warn, or error)

output=$(bunx @biomejs/biome@2.4.2 check "$@" 2>&1)
exit_code=$?

echo "$output"

# Check if there are any diagnostics (errors, warnings, or infos)
if echo "$output" | grep -qE "Found [0-9]+ (error|info|warning)"; then
  exit 1
fi

checks_exit_code=0
./scripts/check-desktop-git-env.sh || checks_exit_code=$?
./scripts/check-git-ref-strings.sh || checks_exit_code=$?
bash ./scripts/check-simple-git-usage.sh || checks_exit_code=$?
bun run scripts/check-pty-daemon-version-bump.ts || checks_exit_code=$?

if [ $exit_code -ne 0 ]; then
  exit $exit_code
fi

exit $checks_exit_code
