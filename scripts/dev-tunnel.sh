#!/usr/bin/env bash
# scripts/dev-tunnel.sh — permanent ngrok tunnel for the myplatform API webhook.
#
# One-time setup (free):
#   1. Claim your static domain: https://dashboard.ngrok.com → Domains
#   2. ngrok config add-authtoken <token>
#   3. Export or hardcode the domain below / NGROK_DOMAIN env var.
#
# Usage:
#   ./scripts/dev-tunnel.sh          # checks API, starts tunnel, prints webhook URL

set -euo pipefail

DOMAIN="${NGROK_DOMAIN:-}"   # e.g. myplatform-dev.ngrok-free.app
API_PORT="${API_PORT:-4000}"

if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: NGROK_DOMAIN is not set."
  echo ""
  echo "One-time setup:"
  echo "  1. Claim your free static domain: https://dashboard.ngrok.com -> Domains"
  echo "  2. ngrok config add-authtoken <token>"
  echo "  3. Run again with: NGROK_DOMAIN=your-name.ngrok-free.dev ./scripts/dev-tunnel.sh"
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ERROR: ngrok is not installed. Install with: brew install ngrok"
  exit 1
fi

# Make sure the API is actually listening before advertising the webhook.
if ! curl -s -o /dev/null "http://localhost:${API_PORT}/users/me"; then
  echo "WARNING: nothing is listening on port ${API_PORT}."
  echo "Start the API first:  cd apps/api && pnpm exec nest start"
  read -r -p "Start tunnel anyway? [y/N] " reply
  [[ "$reply" == "y" ]] || exit 1
fi

echo "Starting tunnel: ${DOMAIN} -> http://localhost:${API_PORT}"
echo ""
echo "Paste this into your GitHub App settings (Webhook URL):"
echo ""
echo "    https://${DOMAIN}/webhooks/github"
echo ""
echo "Press Ctrl+C to stop the tunnel."
echo ""
exec ngrok http --url="${DOMAIN}" "${API_PORT}"
