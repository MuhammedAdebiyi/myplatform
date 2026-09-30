# Known Risks

## Implementation status vs. scope (updated 2026-09-30)

The scope checklist (§46) previously listed User / Organization / Membership /
Auth / RBAC / API Keys / Tenant Isolation / Audit Logs as ❌. All of these are
now implemented and tested:

- ✅ User, Organization, Membership, Sessions (server-side, hashed tokens)
- ✅ Auth: register/login/logout, argon2id, email verification, password reset,
  OAuth (Google/GitHub with PKCE), throttling on all auth endpoints
- ✅ RBAC: 5 roles, explicit permission matrix in code, guard-enforced
- ✅ API keys: hashed, scoped, expiring, rotatable, revocable, last-used tracking
- ✅ Tenant isolation: every tenant query pinned to organizationId; denormalized
  Service.organizationId; cross-tenant access returns 404
- ✅ Audit logs: append-only, USER/API_KEY/SYSTEM actor types, read endpoint
- ✅ Project / Service resources

Newly implemented in this pass:

- ✅ Deployments API (list/create/cancel/rollback) with Idempotency-Key
  support (RULE 21) and transactional outbox (RULE 23)
- ✅ Domains API (list/create/delete)
- ✅ Audit-log read endpoint (AUDIT_READ)
- ✅ Org update + member role-change endpoints; last-owner protection
- ✅ Lifecycle deletes (ACTIVE/DELETING/DELETED) with cleanup worker
- ✅ worker-cleanup: expired token/state purging, outbox pump
- ✅ Bounded DB connection pools (RULE 16) + slow-query logging (RULE 18)
- ✅ Atomic webhook dedup, batched repo sync, worker-build cancel checks

Still open (tracked below): KR-001..003 build isolation/registry/cache,
KR-004 OAuth handoff (fixed 2026-09-30 — one-time exchange codes now used;
kept for the proxy-log history of prior exposure), KR-005 deploy-pipeline
host-docker concerns.

Items on this list are **accepted risks** — things that are explicitly not
safe for production but are tolerated during local development and early
prototyping. Each entry must have:
1. What the risk is
2. Why it's accepted (for now)
3. What must change before production use
4. Who owns the remediation

---

## KR-001: Docker builds use host Docker daemon (no isolation)

**Added:** 2026-09-20
**Status:** Open — must be resolved before multi-tenant or public use

### Risk

`worker-build` shells out to `docker build` using the host Docker socket
(`/var/run/docker.sock`). This means:

- **Every Dockerfile `RUN` command executes as root on the build host.** A
  malicious or compromised Dockerfile can:
  - Read/write any file on the host filesystem (via volume mounts or Docker
    socket bind-mounts)
  - Install backdoors, crypto miners, or exfiltration agents
  - Access the Docker daemon API directly (equivalent to root on the host)
  - Attack other containers running on the same Docker daemon
  - Access environment variables and secrets from other containers

- **No resource limits.** A fork-bomb or memory-hungry build can take down
  the build host.

- **No network isolation.** A build step can reach internal services
  (PostgreSQL, Redis, internal APIs) on the host network.

### Why accepted (for now)

- Single-developer local testing only
- No external users pushing untrusted code yet
- Build queue processes one job at a time (concurrency: 1)
- All code in the repo is trusted (owner's own repos)

### What must change before production

At least one of:
- **Rootless Docker** — daemon runs as unprivileged user, limits namespace
  access
- **gVisor / Kata Containers** — lightweight VM isolation for build
  containers
- **Hosted build service** — offload to a dedicated build infrastructure
  (e.g., Buildkite, custom build runners with ephemeral VMs)
- **Docker-in-Docker (DinD) with locked-down sidecar** — isolated daemon
  with no access to host filesystem

Additionally:
- Resource limits (CPU, memory, disk) on build containers
- Network policy (builds cannot reach internal services)
- Build timeout enforcement (already partially done: 600s max)
- Audit logging of all build commands

### Owner

TBD — requires infrastructure/security design pass before public beta.

---

## KR-002: Build images are local-only (no registry push)

**Added:** 2026-09-20
**Status:** Open

### Risk

Built Docker images stay on the local machine. If the build host dies or
the image is garbage-collected, the deployment artifact is lost. Cannot
deploy to multiple nodes, cannot roll back, cannot serve traffic from a
different host.

### Why accepted (for now)

- Single-host development environment
- No horizontal scaling needed yet

### What must change before production

- Configure container registry (ghcr.io, ECR, etc.)
- Push images after successful build
- Store imageDigest (already done) + registry URL in Deployment
- worker-deploy pulls from registry, not local

---

## KR-003: No build cache or layer optimization

**Added:** 2026-09-20
**Status:** Open

### Risk

Every build downloads the full base image and runs all layers from scratch.
No BuildKit cache mounts, no layer caching between builds of the same repo.
Builds are slower and use more bandwidth than necessary.

### Why accepted (for now)

- Only one repo being built during development
- Build speed not critical yet

### What must change before production

- Enable BuildKit cache
- Cache base image layers on the build host
- Consider build args for dependency caching (e.g., `--mount=type=cache`)

---

## KR-004: OAuth handoff passes the session token in a URL query parameter

**Added:** 2026-09-30
**Status:** RESOLVED 2026-09-30 — the callback now redirects with a one-time,
60-second, sha256-hashed exchange code; the web app exchanges it via POST
/auth/exchange server-to-server. Session tokens no longer appear in URLs.
Kept here for the record of prior exposure.

### Risk

After the API completes the OAuth code exchange, it redirects the browser to
`{APP_URL}/api/auth/oauth?token=<session-token>`. The raw session token
appears in:

- browser history
- intermediary / reverse-proxy access logs
- potentially the Referer header on the next navigation

The token is consumed immediately into an httpOnly cookie, but exposure in
URLs is against secret-handling discipline (RULE 07 in spirit).

### Why accepted (for now)

- Cookie is httpOnly, secure in production, SameSite=Lax
- Local/single-operator deployment; no shared proxies in the path

### What must change before production

- Exchange a short-lived one-time code (stored server-side, single use,
  ~60s TTL) for the session token via a POST from the callback page — the
  session token then never appears in any URL.

### Owner

TBD — small, self-contained change to oauth.controller completeOnFrontend +
web /api/auth/oauth route.

---

## KR-005: Build/deploy containers use the host Docker daemon (deployment pipeline)

**Added:** 2026-09-30
**Status:** Pipeline implemented end-to-end on a single host; isolation still open (supersedes details in KR-001 for the deploy stage)

### What now works

Full deployment state machine (RULE 24):
PENDING → BUILDING (worker-build) → DEPLOYING (worker-build, after image build) →
HEALTHY/FAILED (worker-deploy runs the container, waits for it to stay up).
Service env vars (including AES-256-GCM secrets) are injected at container
start by worker-deploy. Outbox events route: deployment.* → build queue →
worker-build → deploy queue → worker-deploy; project/service cleanup →
worker-cleanup.

### Still open

- Single host, local docker daemon (KR-001 isolation concerns apply to deploys too)
- No registry push (KR-002): images stay local; multi-host deploy impossible
- Health check is "container stays running", not HTTP health-check probes
  (HealthCheck model exists; HTTP probing is the next increment)
- Rollback enqueues a deployment referencing the old image; worker-deploy
  honors it via configSnapshot.imageTag
