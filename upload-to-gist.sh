#!/bin/bash
# Upload gist-updated.json to Gist
# Requires GitHub personal access token with "gist" scope
# Usage: GITHUB_TOKEN=ghp_xxx ./upload-to-gist.sh

set -e

GIST_ID="51087d041078b96b8b702e91395331e5"

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: Set GITHUB_TOKEN environment variable"
    echo "Create one at https://github.com/settings/tokens (needs 'gist' scope)"
    echo "Then run: GITHUB_TOKEN=ghp_xxx $0"
    exit 1
fi

CONTENT=$(node -e "const d=require('./gist-updated.json'); process.stdout.write(JSON.stringify(d))")

curl -s -X PATCH \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/gists/$GIST_ID" \
  -d "{\"files\":{\"novomind-email-response-templates.json\":{\"content\":$(echo "$CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}}}" \
  && echo "" && echo "Gist updated successfully" \
  || echo "Failed to update Gist - check your token"
