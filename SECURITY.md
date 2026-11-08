# Security

OpenRoster is alpha software. Do not use it to process real payroll or store sensitive employee documents until you have reviewed the code and deployed it with TLS, backups, and restricted access.

## Supported versions

Only the latest prerelease is supported for security fixes. Older alpha tags are
snapshots and may not receive backports.

| Version | Supported |
| --- | --- |
| `0.11.x-alpha` | Yes |
| `< 0.11.0-alpha` | No |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting:
https://github.com/jaxjixmix/openRoster/security/advisories/new

Include:

- affected version or commit
- reproduction steps
- impact
- whether the issue is already public

We will acknowledge reports as soon as possible. This is a small alpha project, so there is no formal SLA yet.

## Scope

In scope:

- authentication and authorization bypass
- cross-tenant or cross-employee data access
- payroll/timesheet tampering
- file/document access
- SQL injection or arbitrary code execution
- destructive actions that bypass the archive rules

Out of scope:

- the absence of tax tables or payroll compliance (documented alpha limitation)
- the demo seed credentials, when used on a demo database
- self-hosted deployments without TLS or backups
- rate limiting beyond PocketBase's defaults

## Deployment checklist

- Change the PocketBase superuser and demo passwords.
- Put the app behind HTTPS.
- Keep the PocketBase dashboard private.
- Back up `pb_data` and test restores.
- Do not expose the setup endpoint after setup (it self-disables).
- Review PocketBase API rules before customizing the schema.
