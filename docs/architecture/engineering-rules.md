# myplatform Engineering Rules

These rules are non-negotiable. Any code change — human or agent-authored —
must comply with every rule below. If a change appears to require breaking
one, stop and raise it explicitly rather than silently violating it.

## Architecture context

The identity/tenancy boundary is the foundation everything else sits on:

Organization is the security boundary. Project and Service are resources
inside that boundary. Every tenant-owned resource must be reachable only
through an explicit Organization membership check — never by ID alone.

## Security

- RULE 01: No unauthenticated mutation of tenant resources.
- RULE 02: Authentication and authorization are separate concerns.
- RULE 03: Every tenant resource access must establish tenant context.
- RULE 04: Never trust organizationId supplied by the client.
- RULE 05: Never trust role/permission supplied by the client.
- RULE 06: API keys are hashed and scoped.
- RULE 07: Secrets never enter logs or audit metadata.
- RULE 08: System actors are distinct from human actors.

## Database

- RULE 09: Database constraints enforce invariants (not just app code).
- RULE 10: Indexes follow query patterns, not model fields.
- RULE 11: No unbounded collection queries.
- RULE 12: No N+1 queries.
- RULE 13: Select only required fields.
- RULE 14: Multi-record invariants use transactions.
- RULE 15: High-volume collections use cursor pagination.
- RULE 16: Connection pools are explicitly bounded.
- RULE 17: Migrations are version controlled.
- RULE 18: Slow queries are observable.

## Distributed systems

- RULE 19: Asynchronous work goes through queues, not DB polling.
- RULE 20: Workers are idempotent.
- RULE 21: Mutation endpoints that can be retried support idempotency keys.
- RULE 22: Database state is the source of truth, not the queue payload.
- RULE 23: Important DB + event operations use a transactional outbox.
- RULE 24: Infrastructure operations are state machines, not fire-and-forget commands.

## Code architecture

- RULE 25: Controllers don't contain business authorization logic.
- RULE 26: Tenant context is explicit in every function signature that needs it.
- RULE 27: Workers don't bypass authorization accidentally.
- RULE 28: No direct Prisma access scattered throughout controllers — go through a service.
- RULE 29: External input is validated (DTO + class-validator, no `any`).
- RULE 30: Every new feature defines its failure modes before merging.

## HTTP status semantics (enforced everywhere)

- 401 — not authenticated.
- 403 — authenticated, but lacks permission.
- 404 — resource not visible within the caller's tenant boundary
  (even if it exists for another tenant — never leak existence).

## Definition of done (applies to every task, no exceptions)

A task is not complete when the code compiles or matches the requested
pattern. It is complete only when its actual runtime behavior has been
traced or tested, not assumed.

- RULE 31: `npx nest build` succeeding proves the TypeScript is valid.
  It proves nothing about runtime behavior, guard ordering, or
  authorization correctness. Never report a task as fixed on the basis
  of a successful build alone.

- RULE 32: Any change to a Guard, Interceptor, or Middleware must be
  accompanied by an explicit trace of every guard in the chain for
  every distinct input type it can receive (session token, API key
  token, no token, expired token, malformed token). Write out what
  each guard returns for each case before declaring the change correct.
  If a guard chain has 3 guards and 4 input types, that's 12 cells —
  fill in all of them, don't spot-check the happy path.

- RULE 33: When implementing anything the engineering-rules.md
  explicitly calls out as a security boundary (tenant isolation,
  permission checks, actor identity, secret handling), write the
  adversarial test case first — the one where a malicious or careless
  caller tries to cross the boundary — and show it failing before the
  fix, then passing after. Do not rely on code review by inspection
  for these cases; inspection is exactly what missed the last two bugs.

- RULE 34: Never use the words "done," "fixed," "complete," or
  "correct" in a report unless immediately followed by the specific
  test or trace that demonstrates it. "Should work" and "verified with
  test X" are not the same claim — don't conflate them.

- RULE 35: If a fix touches authorization or tenant isolation, the
  report must explicitly answer: "what does this fix prevent, and what
  is the exact request that would have exploited it before this
  change?" If that question can't be answered concretely, the fix
  isn't understood well enough to be trusted yet.
