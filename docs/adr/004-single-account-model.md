# ADR 004: Single Account Model

## Status

Accepted

## Context

The product supports one customer account with one unified management space, not customer-created
or customer-selected workspaces. The current Platform persistence model already uses the
authenticated `User` as the account principal and has no persisted Account, Workspace, Project, or
Membership entities. Legacy workspace/project routes and some auxiliary model names remain for
compatibility.

Platform calls Core through a service-configured API key. Core authenticates the Platform service
tenant, not an individual Platform user. Platform therefore remains responsible for authorizing its
own records before using Core resource IDs. Separately, `BusinessIntegration` currently allows only
one connection per `(user_id, provider)`, so multiple stores from the same provider are not
implemented.

## Decision

- Treat the authenticated Platform `User` as the current customer account principal. Do not add a
  second Account model or new workspace/project/membership persistence without a distinct reviewed
  requirement.
- Keep existing workspace/project routes only as a compatibility surface. Mark them deprecated in
  OpenAPI, keep their synthetic context and user-ID checks, and direct new clients to direct
  user-owned endpoints. Do not remove or change their response contract until consumers and a
  compatibility plan have been reviewed.
- Keep account ownership and authorization in Platform. Core remains independently reusable and
  unaware of Platform accounts, workspaces, and memberships.
- Do not change schema or run a migration as part of this decision. Any future multi-store work must
  first define connection identity, provider authorization, uniqueness, backfill, and compatibility
  behavior.

## Consequences

- **Positive:** The product model matches existing direct-user persistence and avoids introducing
  an unsupported workspace abstraction.
- **Positive:** Legacy clients retain a deprecated compatibility path while new UI can use
  account-owned APIs directly.
- **Trade-off:** Legacy names and shims remain until their consumers can be retired safely.
- **Trade-off:** A Platform Core service credential does not provide per-user isolation in Core;
  Platform ownership checks on Core resource references are essential.
- **Limitation:** One connection per user/provider remains the current integration constraint.

## Alternatives considered

1. Reintroduce persisted workspaces and memberships. Rejected because it conflicts with the
   single-account product model and current user-owned implementation.
2. Remove all legacy routes immediately. Rejected until external and internal consumers are
   identified and a compatibility plan is approved.
3. Add a separate Account table now. Rejected because it would duplicate the current principal
   without a demonstrated need and require a data migration.
