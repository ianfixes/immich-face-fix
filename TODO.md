# Roadmap: mock Immich, testable front end, Node proxy, CI, Docker

**Objective:** Introduce a **Node-based mock Immich** (with its own tests), use it to **refactor** `index.html` + inline JavaScript into maintainable, **automated-test-friendly** sources, then **reimplement the production reverse proxy** in Node while preserving behavior. **Phase 5** migrates **API credentials** from server configuration (where any LAN client can abuse a shared injected key) to **browser-supplied keys** forwarded by the proxy **without caching on the server**. At every stage, **CI runs automated tests**, and **Docker** provides a single way to launch the stack used for those tests.

**Architecture:** See **`Architecture.md`** for the full picture (reverse proxy rationale, planned Node stack, mock/testing, optional browser-supplied credentials).

**Current state:** `serve.py` (Python, stdlib) + `index.html` with a large inline `<script>`; no mock Immich, no `package.json`, no CI workflow.

**Non-goal (for now):** Unit tests for the trivial Python proxy logic—focus automation on the mock, front-end structure, and end-to-end behavior.

---

## Phase 0 — Compose + Playwright smoke test (no mock yet)

- [ ] **Docker Compose test stack (minimal)** — Create `docker-compose.test.yml` with at least **Face Fix (`serve.py`) + test-runner** (Node + Playwright), intentionally **without** mock Immich for this first milestone.
- [ ] **Canonical test script** — Add one repository-owned entrypoint (`scripts/test-integration.sh`) that runs the Compose stack and returns a correct exit code. The script must require an artifacts-directory argument (fail fast if omitted), and pass that directory into the test-runner container through volume mapping and/or environment variables as needed.
- [ ] **Playwright smoke scenario** — Launch the app in headless mode, confirm the page shell renders, and save a screenshot artifact.
- [ ] **CI parity (smoke)** — CI must invoke the same canonical script used locally; do not duplicate stack orchestration logic in workflow YAML.
- [ ] **Artifact capture** — Publish the screenshot from both local run docs and CI artifact upload so this first test is visibly reproducible.

---

## Phase 1 — Mock Immich (Node) + tests

- [ ] **Scope the API** — List only the Immich routes and response shapes the current UI actually uses (people list, search metadata, faces, thumbnails, reassign, person create/delete, etc.); avoid speculative endpoints in the initial mock.
- [ ] **Implement mock server** — Node HTTP server (or minimal framework) that serves those routes with **stable, deterministic** JSON and placeholder images where needed.
- [ ] **Test the mock** — Automated tests (e.g. `node --test` or Vitest) that assert routes, status codes, and key JSON fields so refactors to the mock do not silently break the contract.
- [ ] **Docker** — Dockerfile or service definition for the mock image (or multi-stage later); document port and env (e.g. accepted API key).
- [ ] **CI** — Workflow job that checks out the repo, installs Node deps if any, and runs the mock’s test suite.

---

## Phase 2 — Add mock to stack and observe behavior changes

- [ ] **Wire mock into Compose** — Update `docker-compose.test.yml` so the app proxies to **mock Immich** instead of a non-functional upstream.
- [ ] **Playwright observation update** — Update the scenario and screenshot to reflect what the UI now sees with mocked data (people list, loading states, or other visible differences).
- [ ] **Baseline artifacts** — Keep representative screenshots/traces from “no mock” vs “with mock” runs to anchor expected behavior changes.
- [ ] **CI** — Continue to run via the same canonical script and publish artifacts for both the smoke and mock-backed scenario.

---

## Phase 3 — Refactor HTML + JS + full-stack automated tests

- [ ] **Extract JavaScript** — Move application logic from inline `<script>` to one or more `.js` files (modules recommended); keep `index.html` as structure + asset links; ensure `serve.py` still serves paths correctly (or serve from `dist/` as today).
- [ ] **No bundling in this phase** — Serve extracted JavaScript directly as native browser modules; do not introduce a bundler/build pipeline in Phase 3.
- [ ] **Optional: extract CSS** — Move `<style>` to linked CSS for clarity.
- [ ] **Pure helpers** — Where practical, isolate **pure functions** (filters, session keys, auto-fix decision inputs) in small modules for fast unit tests in Node.
- [ ] **Browser automation** — **Playwright** (Node) drives the app: Face Fix server → proxy → **mock Immich** (same wiring as production, different upstream URL).
- [ ] **HTML check** — Integrate `html-validate` (or similar) on `index.html` and linked assets.
- [ ] **Integration assertions** — Convert observed mock-backed behavior into explicit Playwright assertions (not just screenshots) to guard regressions.
- [ ] **JS unit tests** — Add fast Node-based unit tests for extracted pure helpers.
- [ ] **CI** — Extend workflow (still via the canonical script) to run integration assertions + HTML check + JS unit tests and fail the pipeline on failure.

---

## Phase 4 — Production reverse proxy in Node

- [ ] **Parity** — Node server mirrors `serve.py`: static files, `/api` proxy with `x-api-key`, `GET /api/_immich-url`, startup connectivity check, CLI/env for `IMMICH_URL`, `IMMICH_API_KEY`, `PORT`.
- [ ] **Cutover** — Document default command (Node); keep or deprecate Python path per release policy (see **`Architecture.md`** — language choice and planned stack).
- [ ] **Docker** — Production-oriented image (Node runtime, app static assets, entrypoint for the Node server).
- [ ] **CI** — Same automated suite still passes using the Node Face Fix server instead of Python (update Compose and workflows).

---

## Phase 5 — Browser-supplied API key (no server-side secret)

**Goal:** Stop treating the Face Fix server as a **silent bearer** of Immich credentials for every client on the network. Only a client that **sends** a valid `x-api-key` (normally the operator’s browser) can drive Immich through the proxy. The server **must not** read the API key from env, files, or long-lived cache; it **forwards** the header the browser sends on each request. Full rationale and trade-offs: **`Architecture.md`** → *Optional design (Phase 5): browser-supplied credentials*.

- [ ] **Proxy** — Remove injection of `x-api-key` from server config; **allowlist and forward** `x-api-key` (and any other required Immich headers) from the incoming browser request to upstream; ensure no code path stores the key in env, files, or application-level caches between requests.
- [ ] **Logging / diagnostics** — Do not log request headers that contain secrets; strip or redact in any debug output.
- [ ] **UI** — Collect Immich base URL and API key in the app via user-entered text input; centralize `fetch` so every `/api` call attaches the key; never ship a fixed key in source.
- [ ] **No remember-key behavior** — Do not persist API key material in `localStorage`, `sessionStorage`, IndexedDB, cookies, URL params, or files. Require manual re-entry each app load.
- [ ] **Startup** — Replace “connectivity check uses server env API key” with a flow that runs **after** the user provides credentials (or skip automatic check until then).
- [ ] **Docker / CLI** — Document running without `IMMICH_API_KEY` in the container or compose file; Immich URL may remain a non-secret default or also come from the UI—document the chosen model.
- [ ] **Tests** — Update Playwright (and mock Immich) so requests include the key from the test/browser context; assert the proxy forwards headers and that server-side config does not contain the key.
- [ ] **README / security** — Document loopback binding, LAN exposure, and client-side key risks (see Architecture).

---

## Ongoing — CI/CD and documentation

- [ ] **Single automation entrypoint** — Document one canonical command (or wrapper script) for the full suite and require both local developers and CI to use it unchanged.
- [ ] **Triggers** — Run on push and pull request to the default branch; cache npm where helpful.
- [ ] **Branch protection** — Require CI green before merge (repository settings).
- [ ] **README** — User-facing run instructions; **Development** section: Node version, how to run mock-only tests, full stack + E2E locally or via Docker; link **`Architecture.md`** for design detail.

---

## Definition of done (rolling)

**After Phase 0:** Docker Compose + Playwright can launch the app headlessly and produce a screenshot artifact using the same script locally and in CI.

**After Phase 1:** Mock Immich exists in Node, has automated tests, is runnable in Docker, CI runs those tests.

**After Phase 2:** Compose stack uses mock Immich; Playwright artifacts clearly show expected UI differences versus the no-mock smoke baseline.

**After Phase 3:** Front-end sources are split from `index.html`; Playwright integration assertions run against mock Immich; HTML validation and JS unit tests run in CI; the same canonical test script is used both locally and in CI.

**After Phase 4:** Node is the supported production server implementation; Python proxy optional or retired per policy; CI still green with Docker-based automation.

**After Phase 5:** API key is **not** stored on the server; proxy forwards browser-supplied credentials only; documentation and automated tests reflect the new model (**`Architecture.md`**).
