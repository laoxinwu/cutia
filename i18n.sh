#!/usr/bin/env bash
# Usage: OPENAPI_KEY=sk-xxx [OPENAPI_HOST=https://your-endpoint/v1] ./i18n.sh
#
# i18next-toolkit falls back to OPENAPI_HOST / OPENAPI_KEY on its own when
# translator.openai.baseURL / apiKey are absent from .i18next-toolkitrc.json,
# so keep those two fields out of the rc file or the env vars are ignored.
set -euo pipefail

: "${OPENAPI_KEY:?OPENAPI_KEY is required (OPENAPI_HOST is optional, defaults to https://api.openai.com/v1)}"

cd "$(dirname "$0")/apps/web"
bun run translation:extract
bun run translation:translate
