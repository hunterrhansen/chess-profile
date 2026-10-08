#!/usr/bin/env bash
# `tofu apply`, trying each availability domain in turn while Oracle is out of ARM capacity
# (common for Always Free). Run it after reading `tofu plan`: it applies without asking.
#
#   ./apply.sh [minutes to keep trying, default 20]
set -uo pipefail
cd "$(dirname "$0")" || exit

deadline=$(( $(date +%s) + ${1:-20} * 60 ))
while :; do
  for ad in 1 2 3; do
    echo "== Availability domain $ad"
    out=$(tofu apply -auto-approve -input=false -var "availability_domain=$ad" 2>&1)
    status=$?
    echo "$out" | tail -n 25
    [[ $status -eq 0 ]] && exit 0
    if ! grep -qi "out of host capacity\|out of capacity" <<<"$out"; then
      echo "Failed for another reason than capacity; stopping." >&2
      exit "$status"
    fi
  done
  if (( $(date +%s) > deadline )); then
    echo "Still out of capacity; try later, or fewer OCPUs (-var ocpus=2 -var memory_gb=12)." >&2
    exit 1
  fi
  echo "All three are full; trying again in 60 seconds."
  sleep 60
done
