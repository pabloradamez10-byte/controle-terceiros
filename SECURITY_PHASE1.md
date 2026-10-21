# SST phase 1 security hardening

Scope: repository `pabloradamez10-byte/controle-terceiros`, Supabase project `obzycbtfbadjwwwfpsed`. Baseline commit: `80358d2cf424690bf8b36c7ff5709cbdf270d033`.

Changes:
- `security.js` sanitizes HTML insertion through DOMPurify 3.4.17. Recognized legacy inline actions become data attributes interpreted by a finite dispatcher; arbitrary JavaScript is never evaluated. Static actions are converted at DOM readiness. Inline event execution is prohibited by CSP.
- Inline script bodies have exact CSP hashes. Run `npm run csp` after editing any inline script and review the resulting policy. WebAssembly execution is allowed for OCR, not arbitrary JavaScript evaluation. `frame-ancestors` still requires a response header at the future internal server; a meta policy cannot provide it.
- Private SST localStorage keys are now backed by a per-tab memory map. Legacy persisted values for those keys are removed on startup. Other application keys are preserved. Data is fetched again after login. Session tokens remain in per-tab sessionStorage and are erased on logout; server logout is attempted with a five-second timeout. Offline remote revocation cannot be guaranteed.
- Logout clears timers, session references, memory, rendered sensitive content and legacy caches. The application reloads. Generation checks prevent late refresh/network replies from restoring a terminated session.
- Service-worker caching is restricted to a fixed list of public application files. Authenticated requests, APIs, non-GET requests and arbitrary URLs are not intercepted. Private fetches explicitly use `cache: no-store`. No API failure is replaced by the application HTML.
- Consult-only profiles use authenticated, scoped read RPCs with an allowlisted access-check projection. No document collections or history are returned. Admin, cadastro and SESMT profiles keep their existing operational access. Dedicated private document storage and a finer document-access matrix remain phase 2 work.
- Backend policies require active membership, including administrator policies. Unnecessary schema creation and TRUNCATE/REFERENCES/TRIGGER grants were revoked. No business data was migrated or deleted.
- SheetJS was updated from 0.18.5 to vendored 0.20.3. DOMPurify and SheetJS assets have SRI hashes, licenses and a SHA-256 manifest in `vendor/`.

Validation completed:
- `npm test`: sanitizer/XSS cases, allowed button dispatch, keyboard navigation, sensitive memory cleanup, service-worker cache boundaries, CSP hashes, full application scripts with a synthetic authenticated backend, logout request, and XLSX round trip.
- Existing audit synchronization and 36 report-rule combinations pass.
- `tests/security-permissions.sql`: consult-only projection, direct-read isolation, write refusal, disabled-member/admin denial, excessive-grant removal. Every profile change was rolled back.
- Before/after database checks: identical application-state hash, 3 members, 1 exception, 1 audit event, 1 historical version. No test artifacts persisted.

Limits and release gates:
- Browser/UI tests use jsdom and a fake authenticated backend. A real interactive login/recovery, document PDF viewer, mobile layout and live OCR still require browser homologation; a successful deployment alone is not that validation.
- Portaria decisions still need a server-authoritative decision API, refresh/expiry policy and physical-entry recording where required. These are not implemented by the read projection.
- Full backups/restore, private file storage and validation, MFA and compromised-password protection, internal-server deployment and final TI/privacy approval remain outstanding.
- SQL is recorded as source for review; production migration history contains the smaller applied changes. Do not blindly rerun creation scripts over existing functions/policies.
- Rollback: Git retains the original frontend. Admin/cadastro/SESMT direct reads remain compatible with it, but an old consult-only client will fail closed and must refresh. Do not restore excessive database grants to roll back a UI problem.
