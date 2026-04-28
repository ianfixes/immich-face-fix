# Architecture

This document describes why the application uses a **local reverse proxy** in front of the Immich API, how responsibilities are split between that server and the browser, the **planned Node-centric** tooling (mock Immich, tests, eventual Node server), and a **planned migration (Phase 5)** where the **Immich API key is supplied by the browser** and is **never stored, cached, or injected by the server**—so the proxy is not a network-wide “silent bearer” of full API access for anyone who can reach the port.

The server can be implemented in any language or runtime that can bind an HTTP listener, serve static files, and forward requests to an upstream URL with configurable headers.

---

## Why a reverse proxy is required

The browser UI needs to call Immich’s HTTP API (people, faces, assets, search, etc.). Two constraints make a **same-origin** intermediary necessary in typical deployments.

### Cross-origin requests (CORS)

If the UI were loaded from `file://`, or from a static host, or even from `http://localhost` while the API lives at `https://photos.example.com`, the browser would perform **cross-origin** `fetch` calls to Immich. The Immich server must respond with appropriate `Access-Control-Allow-*` headers for the page’s origin. Many self-hosted setups do **not** expose the API to arbitrary browser origins, so the browser may block responses before your JavaScript can read them.

Serving the UI and forwarding API traffic through **one origin** (e.g. `http://127.0.0.1:8080`) avoids that class of failure: the browser only talks to that origin; the server forwards to Immich on a **server-to-server** request where CORS does not apply.

### API credentials (default model)

Immich expects an API key (commonly via the `x-api-key` header). If the browser called Immich directly, the key would have to live in the page or in browser storage—visible to anyone who can use the devtools or run script on that origin, and hard to rotate without user action.

Keeping the key **only in the server process** means:

- The browser never sends the Immich base URL’s credentials; it only requests paths like `/api/...` on the local server.
- The server attaches the key when it forwards to Immich.

That pattern does not depend on a particular language: any process that can hold configuration and add headers to outbound HTTP requests can implement it.

---

## What the server is responsible for

| Concern | Role |
|--------|------|
| **Configuration** | Read Immich base URL, API key, and listen address from environment and/or command-line arguments. Fail fast if required values are missing. |
| **Static assets** | Serve HTML, JavaScript, CSS, and any other files the UI needs, so the tool works from a single local URL. |
| **Reverse proxy** | For requests whose path is under the API prefix (e.g. `/api/`), forward method, path, query string, and body to `{immich_base_url}{path}`, and add `x-api-key` (and any other required headers). Stream or copy status, headers, and body back to the client. |
| **Optional metadata** | Expose a small, same-origin endpoint if the UI needs the configured Immich base URL for display or for building absolute links (without embedding secrets). |
| **Optional diagnostics** | On startup, a single request to a known Immich endpoint can verify connectivity and surface misconfiguration before the user opens the UI. |
| **Operational UX** | Logging, graceful shutdown, and optionally opening a browser—convenience only, not architectural requirements. |

The server should **not** duplicate business rules that belong in the client (face review flows, undo stacks, etc.) unless you deliberately move logic server-side for other reasons.

---

## What the browser is responsible for

| Concern | Role |
|--------|------|
| **User interface** | Layout, keyboard shortcuts, loading states, error messages shown to the user. |
| **API usage** | Call **only** the local origin (e.g. `fetch('/api/...')`) so all Immich traffic goes through the proxy. |
| **Client-side state** | Selection of people, current asset, face annotations, pending actions, and undo history. |
| **Presentation** | Thumbnails, canvases, image URLs—often as paths relative to the same origin so images still pass through the proxy when needed. |

Under the **default** credential model, the browser **must not** embed the Immich API key. It **should not** assume Immich allows direct browser access; that keeps the tool working when CORS is locked down. (If you adopt the **optional browser-supplied key** model below, the browser sends the key on each same-origin request; see that section for trade-offs.)

---

## Language choice and planned Node-centric stack

Nothing in this architecture **requires** a specific implementation language. A small HTTP server that serves static files and proxies `/api` with an injected API key is equally expressible in Python, Node.js, Go, Rust, etc. The split of responsibilities above stays the same.

**Current implementation:** a stdlib **Python** server (`serve.py`).

**Planned:** reimplement the same reverse-proxy + static-file behavior in **Node.js** so the server, mock Immich, browser automation, and optional JS unit tests share one toolchain and CI story (see `TODO.md`). Behavior from the browser’s perspective (same origin, `/api` proxy, **default:** no key in the page) remains unchanged unless you explicitly implement the optional credential model.

The repository is moving toward:

| Piece | Role |
|--------|------|
| **Mock Immich (Node)** | HTTP server that implements the subset of Immich API routes the app uses; used for automated tests and local dev without a real library. Covered by its own tests so responses stay consistent. |
| **Face Fix server** | Today: `serve.py` (Python). **Target:** same behavior in **Node**—static files + `/api` reverse proxy + `x-api-key` injection—so deployment, CI, and app JS tooling align. |
| **Browser automation** | e.g. **Playwright** (Node) drives the UI against the Face Fix server with upstream set to the mock (or real Immich when desired). |
| **Docker** | Compose (or equivalent) runs mock + app + test command so CI and developers share one path to “run everything.” |

The Node migration is about **implementation language and testability**. The **default** production model through **Phase 4** remains **server-held key**; **Phase 5** (see `TODO.md`) migrates to **browser-supplied key** as described under [Optional design (Phase 5): browser-supplied credentials](#optional-design-phase-5-browser-supplied-credentials).

---

## Automated testing and the mock Immich server

End-to-end and integration tests need an HTTP upstream that returns **Immich-shaped** responses without requiring a real photo library. The plan is a **mock Immich server implemented in Node**, maintained alongside the app, with its own **automated tests** so fixture behavior stays stable.

- In **CI and local Docker-based flows**, the mock runs as a separate process (or container); the Face Fix server points `IMMICH_URL` at it with a test API key the mock accepts.
- The **browser still talks only to the Face Fix origin**; the proxy forwards to the mock exactly as it would to real Immich. That keeps tests aligned with production wiring.
- A **browser driver** (e.g. Playwright via Node) exercises the UI against the running stack. **Docker Compose** orchestrates mock + app + test runner so “run all automated tests” is one repeatable command.
- The project should define a **single canonical test entrypoint** (for example, `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test-runner`, or a wrapper script that runs this) and use it **unchanged** in local development and CI. CI should call the same repository-owned command/script rather than re-encoding orchestration logic in workflow YAML.

This does not change the **production** security model for the default deployment: real instances still use a real Immich server; the mock exists for automation and developer feedback.

---

## Optional design (Phase 5): browser-supplied credentials

**Roadmap:** This is the **target** credential model for **Phase 5** in `TODO.md`. Phases **1–4** intentionally keep the **server-held API key** (env/CLI) so the mock, Playwright, and Node proxy parity stay straightforward. Phase 5 switches trust so only clients that **possess** the key (typically the operator’s browser session) can complete Immich requests, while the server **never** retains the key in configuration, memory beyond request forwarding, or logs.

This section describes that design: a small **Node** (or similar) process acts as a **static file server** and **reverse proxy**, and the **Immich API key is provided by the browser** on each `/api` request rather than read from server configuration.

**Goals:** avoid the pattern where **any** host on the network that can reach the proxy gets Immich API access **without** presenting a secret (because the server injects the key). **Narrow** successful use to clients that send a valid key. The server must **forward** the client’s `x-api-key` (or as documented) and **must not** substitute, cache, or persist it.

### Roles

#### Process on the machine (the “server”)

- Listen for HTTP on a configurable address (prefer **loopback only**; see Security).
- Serve the main **HTML**, **CSS**, and **JavaScript** for the tool.
- For paths under the API prefix (e.g. `/api/`), **forward** the incoming request to the configured Immich base URL: same method, path, query string, and body.
- **Forward** selected client request headers to Immich, including the header Immich uses for API keys (`x-api-key` or as documented), so the key travels **from browser → proxy → Immich** without being read from a server config file.
- Optionally expose a read-only endpoint such as `GET /api/_immich-url` that returns the configured Immich **base URL** for display or absolute links—**without** echoing any secrets.

The server **does not**, in this flow:

- Store the API key on disk, in environment variables, or in any server-side cache between requests.
- Add or override the API key itself; it only passes through what the client sends (subject to an allowlist of headers). Each proxied request should carry the key the browser attached for **that** request only.

#### Code in the browser

- Render the UI and hold workflow state (current person, asset, faces, undo, etc.).
- Obtain the Immich **base URL** and **API key** from the user via text input on each app load.
- Issue `fetch()` calls **only to the same origin** as the page (the local server), with paths like `/api/...`, and attach the API key on each request (or use a small client wrapper that does so).
- Never embed a fixed key in shipped source; treat the key as user-supplied secret material.

### Why keep a reverse proxy at all?

1. **CORS** — The browser talks same-origin to the local server; the server talks to Immich without browser CORS rules.
2. **Single entry point** — One local URL serves UI and API-shaped traffic.

What changes is **who holds the credential**: the **browser session** supplies it per request instead of **server configuration**.

### Security model: what improves vs what does not

#### Compared to “key only on the server”

In the **server-key** pattern, any client that can open a TCP connection to the server’s listen address receives responses where the **server** injects the API key. If the server binds to all interfaces (`0.0.0.0`) or is reachable from the LAN, **any** machine that can reach that port can use the full API **without** presenting a secret—because the server adds it.

If the key is **only** supplied by the browser:

- The proxy **forwards** requests; Immich rejects calls that lack a valid key.
- A client that does not send a key (or sends a wrong key) does not get useful API access, even if it can reach the proxy.

The proxy stops being a **silent bearer** of full API power for every HTTP client on the wire; it becomes a **dumb pipe** that only succeeds when a client that knows the key sends credentials.

#### Residual risks

- **Key in the browser** is still sensitive: DevTools, malicious extensions, or XSS could read it if the page is compromised. This is **not** equivalent to a server-only secret.
- **Process memory and logs**: a compromised server could log headers; minimize logging of `Authorization` / `x-api-key`.
- **Binding**: listening on `127.0.0.1` reduces LAN-wide exposure.
- **Persistence**: in this phase, do not persist API key material in browser storage (`localStorage`, `sessionStorage`, IndexedDB, cookies, URL params). Keep key material in memory only for the current page lifetime.

### Division of responsibility (browser-key flow)

| Layer | Responsibility |
|--------|----------------|
| **Server** | Static files; reverse proxy; forward method, body, and allowlisted headers including client-supplied API key; optional non-secret config endpoint for Immich base URL. **No** API key in env/files for this flow. |
| **Browser** | UI; user-entered base URL and API key; attach key to same-origin API requests; no fixed secrets in shipped assets. |

### When this design fits

- You accept the API key as a **user secret in the client** in exchange for the server **not** being an anonymous gateway for everyone who can reach the port.
- You still need **same-origin** proxying to avoid CORS issues.

**When not to rely on this alone:** scenarios where the key must never exist in browser memory—use a different trust model (server-side sessions, OAuth, operator-only tools).

---

## Summary

- **Reverse proxy:** Unlocks API access when CORS would block the browser. **Phases 1–3 (default):** server injects `x-api-key` from env/CLI. **Phase 4:** server forwards the key from the browser only; **never** stores or caches it on the server.
- **Server:** Configuration (through Phase 3), static hosting, proxying, optional health/metadata endpoints. **Planned:** Node implementation equivalent to today’s Python `serve.py`, plus a **Node mock Immich** for tests.
- **Browser:** UI, state, same-origin API calls. **Phases 1–4:** no key in shipped assets; server holds the secret. **Phase 5:** user supplies key (and typically Immich base URL) in the app; attach key per request with no remember-key persistence (see [Optional design (Phase 5)](#optional-design-phase-5-browser-supplied-credentials)).
- **Testing:** **Node mock Immich**, **Playwright** (or similar), and **Docker-orchestrated CI** support automated tests; Phase 5 updates fixtures so E2E supplies a key the mock accepts via **forwarded** headers, matching production behavior.
