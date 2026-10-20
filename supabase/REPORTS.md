# Historical access report

`reports.sql` installs immutable source versions and an admin-only reporting RPC. Apply after `audit.sql` and `audit-enable.sql`. Existing production migrations are recorded in Supabase. Do not replay these creation scripts over an existing schema.

- Source versions begin at installation time. No earlier eligibility is inferred from today's data. Older audit events may exist independently.
- Row triggers capture people, companies and exceptions atomically with each successful source write. File payloads are not copied. Audit events retain sanitized attachment metadata.
- Both source-writing RPCs take the same transaction advisory lock before any row lock. Keep this order in future writers; it prevents concurrent state/exception versions from omitting one another.
- Eligibility is calculated with immutable evaluator `sst-access-v1` in `relatorios.js`, using Brasília dates. Changing eligibility requires a new rule version for future source versions and preserving the old evaluator for older versions. Tests compare the evaluator with live application rule source.
- Intervals end exclusively. Date selection includes the whole final day and stops at report generation time. Daily cuts preserve automatic expiry even when no user edits a record.
- Release authorization is distinct from physical gate entry. No gate-entry register exists in this module.
- `source_actor` and `source_reason` describe who saved a source version, not necessarily who caused each person's status to change. Midnight reevaluation has no human actor.
- Reporting RPC reads all matching database events, not just the 50 loaded in the legacy audit UI. Maximum span: 366 days; explicit errors on >5,000 versions, >20,000 events or >100,000 computed intervals. No silent truncation. Table pagination does not truncate exports.
- PDF is produced through the browser print dialog; CSV contains eligibility intervals; JSON includes raw source versions, full events, selected filters and calculated intervals. The SHA-256 identifies the exported source object serialized with `JSON.stringify`; it is not a digital signature or independent proof of authenticity. Database identities are retained for cross-checking.
- Read access is limited to active administrators via RLS and RPC checks. Application roles cannot insert, update or delete sources or audit entries. Database owners remain privileged.

Validation: `node tests/reports.cjs`, `node tests/audit-sync.cjs`. Run `tests/reports.sql` through an administrative SQL session; every synthetic mutation is rolled back.
