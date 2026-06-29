# Tasks — perks-export (#84 / #89)

> **Scope:** an `export_perks` READ op + `export-perks.mjs` that emit a schema-valid, re-ingestible
> `perks.json` from the federated directory (the server as producer). Generating from accepted
> contributions (#81) and the Nate PR pipeline (#82) are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-perks-export --strict` passes;
> typecheck/lint/both test layers green; `export_perks` emits a valid `PerksPayload` that the
> eval-free checker accepts and `DataSource` can re-ingest; the `feed` filter and `name` override
> work; the server-set `feed` tag is stripped on emit; op-count/parity assertions updated. One commit
> per section, closing #89 on the last; push on `main` as each section completes.

## 1. export_perks op

- [x] 1.1 Export `collectPayloadErrors` from `data/source.ts` (validate-on-emit reuse).
- [x] 1.2 `operations/perks-export.ts`: `export_perks(name?, feed?)` (READ) — programs from
  `data.programs()` (optionally `feed`-filtered), `feed` provenance stripped per program; payload
  `{ name: name ?? meta.name, generated, count, programs }`; validate with `collectPayloadErrors`
  (INTERNAL_ERROR if somehow invalid). Register unconditionally in `buildRouter`.
- [x] 1.3 Tests: `export_perks` emits a valid payload (re-ingests via a fresh `DataSource` to the
  same program count); `feed` filter narrows; `name` overrides; emitted programs carry no `feed`
  field; op-count/parity assertions updated (32→33).

## 2. Export script + validate + archive

- [ ] 2.1 `scripts/export-perks.mjs` (dev tooling): write a `perks.json` from the data layer (local)
  and/or the `export_perks` op (`--url`), peer to `export-flows.mjs`.
- [ ] 2.2 `openspec validate add-perks-export --strict`; typecheck/lint/both test layers green.
- [ ] 2.3 Archive into `openspec/specs/` (`perks-export` created); fill the spec `Purpose`.
