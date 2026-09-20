# Known Risks

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
