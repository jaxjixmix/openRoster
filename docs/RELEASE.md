# Public release checklist

Use this before tagging a public prerelease. The source is already MIT; this
checklist is about being honest and safe to self-host.

## 1. Security and data

- [ ] No geofence, claim, swap or setup race regressions: `make test-api`.
- [ ] `git grep` and CI gitleaks are clean; no `.env`, `pb_data`, test databases or backups tracked.
- [ ] Runtime dependency audit is clean: `cd web && npm audit --omit=dev --audit-level=high`.
- [ ] Backup archive mode is `600` and restore was tested on a throwaway data dir.
- [ ] Fenced sites require coordinates online; offline punches are flagged unverified.
- [ ] Default demo passwords are only used on throwaway demo data.

## 2. Repository

- [ ] `main` is protected with required status checks and one review; admins may bypass for release automation.
- [ ] Dependabot is enabled for npm, GitHub Actions and Docker.
- [ ] CODE_OF_CONDUCT, CONTRIBUTING and SECURITY are current.
- [ ] CHANGELOG has the release entry.
- [ ] README shows the current release and only open follow-ups.

## 3. Verification

```bash
cd /Users/mojics/apps/openRoster
make test && make test-api && \
  (cd web && npm run lint && NEXT_PUBLIC_PB_URL=http://127.0.0.1:18097 npm run build) && \
  make test-ui && docker compose config >/dev/null
```

## 4. Release

```bash
git tag -a vX.Y.Z-alpha -m "OpenRoster vX.Y.Z-alpha"
git push origin vX.Y.Z-alpha
gh release create vX.Y.Z-alpha --prerelease --title "OpenRoster vX.Y.Z-alpha" --notes-file /tmp/notes.md
```

Keep the payroll disclaimer in the release notes: preview/export only, no tax
filings, no direct deposit.

## Branch protection

The intended `main` settings:

- Required status checks: `Build and test`, `Secret scan`; strict (branches must be up to date).
- Require one approving review; dismiss stale reviews; require conversation resolution.
- Block force pushes and branch deletion.
- Keep "Do not allow bypassing" **off** so the maintainer can publish releases; turn it on once release automation uses a protected bot.

Apply with the GitHub API (requires repository admin):

```bash
gh api -X PUT repos/jaxjixmix/openRoster/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Build and test", "Secret scan"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

## Known dev-only audit findings

`npm audit` reports moderate findings in the ESLint/minimatch dev toolchain.
They are not in the runtime bundle; the CI gate above audits production
dependencies only. Track them through Dependabot rather than forcing a
lockfile rewrite.
