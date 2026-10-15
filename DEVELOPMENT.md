# myplatform — local development

## One command to start everything

```bash
./scripts/dev-up.sh
```

That single command:

1. Starts **postgres + redis** via `docker compose` (waits until healthy)
2. Starts the **ngrok tunnel** (`femur-mandatory-unsheathe.ngrok-free.dev` → `:4000`) so GitHub webhooks arrive
3. Runs **all app processes** under [Turbo](https://turbo.build) with prefixed, interleaved logs:

| Process | Where | Port |
|---|---|---|
| API (NestJS) | `apps/api` | :4000 |
| Web (Next.js) | `apps/web` | :3000 |
| worker-build | `apps/worker-build` | — |
| worker-cleanup | `apps/worker-cleanup` | — |
| worker-deploy | `apps/worker-deploy` | — |
| worker-monitoring | `apps/worker-monitoring` | — |
| worker-notifications | `apps/worker-notifications` | — |

**Ctrl+C** stops all app processes at once. The docker containers stay up (fast restarts); stop them with:

```bash
docker compose down
```

### Flags

```bash
./scripts/dev-up.sh --no-tunnel   # skip ngrok (no webhooks)
NGROK_DOMAIN=other.ngrok.dev ./scripts/dev-up.sh   # custom tunnel domain
```

### Prerequisites

- **Docker Desktop** running (the script checks and exits with a clear error if not)
- **pnpm** and dependencies installed (`pnpm install`)
- **ngrok** installed + authtoken configured (optional, only for webhook testing — the script warns and skips if missing)

## What's NOT automated

- **Migrations** are applied manually (see `packages/database/prisma/migrations/` — `prisma migrate dev` must NOT be used, it would reset the DB due to drift)
- The build worker shells out to your **local `docker build`**, so Docker must stay running while builds happen

## Testing / verification

```bash
pnpm test          # all workspaces (turbo)
pnpm build         # all workspaces
cd apps/web && pnpm exec tsc --noEmit   # web typecheck
```
