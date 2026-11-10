# Platform Data and Migration Guidelines

## Database ownership

Platform owns its SQLAlchemy models and database. The current model is user-scoped; see
[`DOMAIN_MODEL.md`](DOMAIN_MODEL.md). Core owns a separate database and schema. Platform stores
Core IDs as opaque references and must not query or migrate Core data.

The backend supports PostgreSQL and SQLite configuration. `backend/app/db/base.py` provides UUID
and JSON type adapters; verify dialect behavior before adding constraints, JSON operators, or raw
SQL. SQLite tests are useful for fast isolated coverage but do not prove PostgreSQL behavior.

## Current schema lifecycle

- Models live in `backend/app/models/` and are registered through `backend/app/models/__init__.py`.
- Alembic configuration, environment, and revision files live under `backend/alembic/`.
- The FastAPI lifespan currently calls `Base.metadata.create_all`; this creates missing objects but
  does not apply or validate Alembic revisions.
- The repository therefore contains both startup schema creation and a migration history. Do not
  assume which mechanism production uses; deployment ownership and migration sequencing must be
  explicitly verified before a release.

## Schema-change workflow

1. Inspect model relationships, constraints, all current migration revisions, and affected queries.
2. Make a focused model change and create a new Alembic revision. Do not edit an already-applied
   revision to change deployed history.
3. Review generated operations manually, including server defaults, nullability, indexes,
   backfill/rollback behavior, and PostgreSQL/SQLite differences.
4. Apply the migration only to a disposable, explicitly configured database. Test both a fresh
   install and an upgrade from the previous revision; test downgrade only when the migration is
   designed to be reversible.
5. Add data-integrity and API tests, update the domain docs, and ensure startup `create_all` does
   not mask a missing migration or incompatible deployed schema.

From `backend/`, the relevant Alembic commands are:

```text
alembic history
alembic revision --autogenerate -m "describe the schema change"
alembic upgrade head
```

Never run these against an unspecified, shared, or production database. Keep local database files
and test data outside the repository. Do not deploy or run migrations as part of a documentation
change.

## Account ownership and historical workspace migration

The current SQLAlchemy model uses authenticated `User` ownership; there is no Account, Workspace,
Project, or Membership table. Migration `ebe95bc87fd0` backfills legacy ownership into `user_id`
and drops the former workspace/project/membership tables. Its downgrade is a no-op, so the migration
history does not provide a rollback that restores those tables or their data. The revision is in
the current Alembic chain, but this documentation check did not inspect any live database's
`alembic_version` or customer records.

Never replay this ownership migration against a shared or production database as part of routine
development. Before any future schema evolution, verify the target database revision, backup and
restore procedure, row counts/ownership mapping, and forward/rollback plan. No database or migration
was run for this account-model alignment.

`BusinessIntegration` currently has one row per user/provider. Supporting multiple stores for one
provider will require a separately designed connection key, uniqueness change, data migration, and
compatibility plan. This work does not change the schema.
