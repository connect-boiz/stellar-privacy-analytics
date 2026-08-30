#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────
#  Stellar Privacy Analytics — GitHub Environments Setup
#  Creates the production and staging environments with
#  approval-gate protection rules.
#
#  Prerequisites:
#    1. GitHub PAT with `admin:repo` or `repo` scope
#    2. `gh` CLI authenticated or GITHUB_TOKEN exported
#
#  Usage:
#    export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
#    bash scripts/setup-environments.sh
#
#  Then add required reviewers in:
#    Settings → Environments → {name} → Required reviewers
# ────────────────────────────────────────────────────────────

set -euo pipefail

REPO="connect-boiz/stellar-privacy-analytics"
API="https://api.github.com"
TOKEN="${GITHUB_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  # Fall back to `gh` auth
  TOKEN=$(gh auth token 2>/dev/null || true)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ No GITHUB_TOKEN found. Export your token or login with 'gh auth login'."
  echo "   Create one at: https://github.com/settings/tokens (admin:repo scope)"
  exit 1
fi

create_environment() {
  local name="$1"
  local branch_policy="$2"   # "main" or "main-develop"
  local wait_mins="$3"

  echo "🔧 Creating environment: $name ..."

  # Build branch-policy payload
  if [ "$branch_policy" = "main-only" ]; then
    # Custom policies allow us to restrict to specific branches
    POLICY='{"protected_branches":false,"custom_branch_policies":true}'
  else
    # All branches are allowed (permissive for staging)
    POLICY='{"protected_branches":false,"custom_branch_policies":false}'
  fi

  HTTP_CODE=$(curl -s -o /tmp/gh-env-${name}.json -w "%{http_code}" \
    -X PUT \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "${API}/repos/${REPO}/environments/${name}" \
    -d "$(cat <<EOF
{
  "deployment_branch_policy": $POLICY,
  "wait_timer": $(( wait_mins * 60 ))
}
EOF
)"
  )

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "   ✅ Created (HTTP $HTTP_CODE)"
  else
    echo "   ❌ Failed (HTTP $HTTP_CODE)"
    cat /tmp/gh-env-${name}.json 2>/dev/null || true
    echo ""
  fi
}

# ── Create environments ──────────────────────────────────

create_environment "production" "main-only"    10
create_environment "staging"    "main-develop"  5

# ── Set custom branch policy for production (main only) ──
echo ""
echo "🔧 Restricting production environment to 'main' branch only ..."

HTTP_CODE=$(curl -s -o /tmp/gh-env-production-policy.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "${API}/repos/${REPO}/environments/production/deployment-branch-policies" \
  -d '{"name":"main","type":"branch"}')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "   ✅ Branch policy added (HTTP $HTTP_CODE)"
else
  echo "   ⚠️  Branch policy creation failed (HTTP $HTTP_CODE)"
  cat /tmp/gh-env-production-policy.json 2>/dev/null || true
  echo ""
  echo "   This may happen if your token lacks admin:repo scope."
  echo "   You can add the policy manually in the GitHub UI later."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Environments created!"
echo ""
echo "  Next: add required reviewers in the GitHub UI:"
echo "    Settings → Environments → production → Required reviewers"
echo "    Settings → Environments → staging    → Required reviewers"
echo ""
echo "  Then verify the pipeline uses them in:"
echo "    .github/workflows/ci.yml"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
