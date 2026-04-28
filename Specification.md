# Specification

## 1. Purpose

`immich-face-fix` is an operator-facing web application for correcting face misassignments in Immich, especially for look-alike people (for example twins or siblings). The app must support efficient manual review, safe corrective actions, and reliable automation so behavior can be validated locally and in CI.

This specification is the source of truth for:

- Product behavior (what the app must do)
- Security and credential handling constraints
- Testability and CI/CD requirements
- Compatibility with the roadmap in `TODO.md` and architecture in `Architecture.md`

---

## 2. Scope

### 2.1 In scope

- A browser UI for selecting a wrong person and a correct person, reviewing assets, and applying face corrections.
- A local same-origin server that serves static assets and proxies `/api/*` to Immich (or a compatible mock server in automated tests).
- Automated test support (unit and integration/e2e), runnable locally and in CI with the same canonical command.

### 2.2 Out of scope

- Modifying Immich internals or direct database writes.
- Replacing Immich recognition models.
- Multi-user permissions/roles beyond possession of a valid Immich API key.

---

## 3. Actors and environments

- **Operator:** human user running the app to fix faces.
- **Developer:** contributor changing app behavior and tests.
- **CI system:** non-interactive runner executing the canonical automated test command.

Supported environments:

- Local machine execution (direct or via Docker/Docker Compose).
- CI execution (Docker/Docker Compose required for full-stack automation path).

---

## 4. Functional requirements (application behavior)

### 4.1 Person selection and setup

1. The app must list available named people from Immich.
2. The operator must select:
   - one **wrong person** (currently contains misassigned faces),
   - one **correct person** (actual identity for those faces).
3. The app must prevent starting review when both selections are the same person.
4. The app must provide review settings before starting:
   - scan mode (`both`, `duplicates`, `solos`),
   - auto-fix mode (`off`, `confirm`, `instant`),
   - skip-both-present behavior.

### 4.2 Review workflow

1. The app must load candidate assets for the wrong person and review them sequentially.
2. For each asset, the app must identify:
   - wrong-person faces in that asset,
   - whether the correct person is also present.
3. The app must support operator actions:
   - reassign face(s) to correct person,
   - keep current assignment,
   - skip,
   - unassign (Immich-style “not this person” behavior),
   - undo.
4. The app must support keyboard-first interaction for speed.
5. The app must render visual context:
   - photo preview,
   - face overlays,
   - face crops.

### 4.3 Auto-fix behavior

1. The app must be able to query top suggestions and decide auto-fix eligibility.
2. In `instant` mode, eligible faces are reassigned without pause.
3. In `confirm` mode, eligible faces show a cancellable countdown.
4. In `off` mode, no automatic reassignment occurs.
5. Auto-fix must not silently apply when decision confidence is outside the defined rule path.

### 4.4 Undo and session persistence

1. Every mutating action (reassign/unassign/auto-fix) must be undoable within the active session.
2. Session progress must be persisted in browser storage and resumable for the same person-pair context.
3. A session reset mechanism must exist for the selected pair.

### 4.5 Summary and operator feedback

1. The app must show running stats during review and a summary at completion.
2. Stats must include at least: reviewed, reassigned, auto-fixed, unassigned, skipped, undone.
3. Errors from upstream API calls must be surfaced to the operator with actionable feedback.

---

## 5. Server/proxy requirements

### 5.1 Core proxy behavior

1. Serve UI/static assets from a single local origin.
2. Proxy `/api/*` requests to configured upstream Immich-compatible API.
3. Preserve request method, path, query, and body.
4. Return upstream status/body/content type back to the browser.

### 5.2 Configuration

1. Server must support configurable listen port and upstream URL.
2. Through roadmap phases up to and including Phase 4 (see `TODO.md`), the server may inject `x-api-key` from server-side config.
3. In Phase 5, server must stop storing/injecting API key and instead forward client-supplied key only.
4. In Phase 5, client-side API key entry must be non-persistent by default implementation: no remember-key storage in browser persistence mechanisms.

### 5.3 Security constraints

1. No fixed API key may be embedded in shipped frontend assets.
2. Secret-bearing headers must not be logged in plaintext.
3. Loopback binding should be the secure default where operationally possible.

---

## 6. Testability requirements

### 6.1 General

1. The project must support automated tests at multiple levels:
   - JS unit tests (fast, deterministic),
   - mock server tests,
   - browser integration/e2e tests.
2. Tests must run non-interactively and produce clear pass/fail exit codes.

### 6.2 Canonical execution parity (local == CI)

1. A single repository-owned canonical test entrypoint must exist (script/Make/npm wrapper accepted).
   - Roadmap-selected script name: `scripts/test-integration.sh`.
2. Local developers and CI must execute the same canonical entrypoint unchanged.
3. The canonical entrypoint must require an explicit artifacts-directory argument and fail fast when omitted.
4. CI workflows may add caching/artifact upload, but must not redefine test orchestration logic separately from the canonical script.

### 6.3 Compose-based full-stack testing

1. Full-stack automated tests must run via Docker Compose (or compatible orchestrated container stack).
2. The stack must include:
   - app server,
   - test runner (Playwright + JS test tooling),
   - mock Immich when running mock-backed scenarios.
3. Artifacts (at minimum screenshots for smoke flows; traces/videos where configured) must be produced and publishable in CI.

### 6.4 Progressive automation milestones

1. Initial smoke milestone must verify headless browser launch + rendered page + screenshot artifact (even before mock integration).
2. Subsequent milestone must add mock server and capture visible behavior change in Playwright artifacts.
3. Regression milestone must convert observed behavior into explicit assertions (not screenshot-only checks).

---

## 7. Mock Immich requirements

1. Provide deterministic, Immich-shaped responses for routes required by the app.
2. Include minimal test fixtures that support person selection and review flows.
3. Have its own automated tests to validate route contracts/status codes/basic response schema.
4. Be runnable in Docker and usable as upstream for both local and CI integration tests.

---

## 8. Data and compatibility requirements

1. App behavior must rely on official HTTP API semantics, not direct database access.
2. Browser-side persisted session data must be scoped by selected person pair to avoid cross-session corruption.
3. API error handling must degrade gracefully when upstream is unavailable or returns non-2xx.
4. In Phase 5, API key material must not be persisted client-side (`localStorage`, `sessionStorage`, IndexedDB, cookies, or URL parameters); manual entry is required per app load.

---

## 9. Non-functional requirements

1. **Usability:** review actions should be keyboard-efficient and visually clear.
2. **Reliability:** automated tests must be deterministic enough for CI gating.
3. **Maintainability:** business logic should be extractable into standalone JS modules suitable for unit testing.
4. **Portability:** local and CI execution must work via Docker-based workflow.
5. **Security posture:** credential handling must follow current roadmap phase with explicit migration to browser-supplied credentials in Phase 5.

---

## 10. Acceptance criteria

The specification is satisfied when all are true:

1. Core face-fix workflow works end-to-end against an Immich-compatible API.
2. Automated tests include:
   - JS unit tests for extracted logic,
   - mock server contract tests,
   - Playwright integration/e2e coverage.
3. The canonical test command runs successfully both:
   - locally,
   - in CI,
   using the same script/entrypoint.
4. Docker/Compose is the documented path for full-stack automated test execution.
5. Credential model and security behavior match the active roadmap phase and are documented in `Architecture.md`.

---

## 11. Traceability

- Architecture decisions and deployment/security trade-offs: `Architecture.md`
- Execution plan and phased delivery: `TODO.md`
- User-facing setup and usage: `README.md`

