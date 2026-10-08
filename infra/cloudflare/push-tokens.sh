#!/usr/bin/env bash
# Puts each tunnel's token into its environment's .env on the machine (TUNNEL_TOKEN), over
# SSH, without showing it: from `tofu output` straight into the file. Run after `tofu apply`;
# safe to run again (it replaces the line).
#
#   ./push-tokens.sh              (the machine from infra/oracle's `tofu output`)
#   ./push-tokens.sh <host>
set -euo pipefail
cd "$(dirname "$0")" || exit

host="${1:-$(cd ../oracle && tofu output -raw public_ip)}"
key="${DEPLOY_KEY_FILE:-$HOME/.ssh/knightly-deploy}"

for env in staging production; do
  tofu output -json tunnel_tokens | python3 -c "import json, sys; print(json.load(sys.stdin)['$env'])" |
    ssh -i "$key" -o IdentitiesOnly=yes "knightly@$host" "
      set -eu
      read -r token
      file=/opt/knightly/$env/.env
      sed -i '/^TUNNEL_TOKEN=/d' \"\$file\"
      printf 'TUNNEL_TOKEN=%s\n' \"\$token\" >> \"\$file\"
      echo \"$env: TUNNEL_TOKEN set (\${#token} characters)\""
done
