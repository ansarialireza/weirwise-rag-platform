# Historical Artifacts & Superseded Brand Records

Dated engineering and design reports live in the local `artifacts/` directory. That directory is intentionally untracked (`.gitignore`), so this page is the tracked record of how to read those files.

The files in `artifacts/` are kept for traceability and are not current product guidance. Brand references in them — including Electric Lime (`#CCFF00`), the Concept 06 mark, and the retired Colorful theme — describe superseded decisions.

Tracked reports with names such as `*_AUDIT*`, `*_REPORT*`, `*_READINESS*`, `*_TEST_REPORT*`,
`*_PHASE*`, or `*_IMPLEMENTATION_PLAN*` are also point-in-time records. Read their scope, date,
and evidence; they are not current architecture or proof of a release. For current implementation
consult [`ARCHITECTURE.md`](ARCHITECTURE.md), its linked engineering documents, and current source.
For current product scope consult [`PRODUCT_VISION.md`](PRODUCT_VISION.md). Preserve historical
reports for traceability and update canonical guidance instead of treating a report as live
documentation.

The current identity is built on the **official Weirwise mark** (`frontend/public/weirwise-mark.svg`), registered in the brand repository and re-drawn only by derivation. It sits on the **Ink and Paper** surfaces (`#0B0E0D` / `#F7F6F3`), the interface signal is **Verdigris and Mint** (`#0E7B6D` / `#5CD6C2`), and the mark keeps its own registered accent (`#25C4D8` on ink, `#1D9AAA` on Paper) supplied by the `--ww-mark-*` tokens. Any earlier symbol in these files, including Electric Lime (`#CCFF00`), the Concept 06 mark, the provisional flowing-W mark, Signal Cyan (`#3FD0DA`), and the retired Colorful theme, is superseded. Authoritative sources:

- Brand system and master artwork: `ansarialireza/weirwise-brand`.
- Implemented tokens: `frontend/src/app/globals.css` and `frontend/tailwind.config.ts`.
- Derived asset build: `scripts/brand/build-official-mark.mjs`.

Where a historical report conflicts with the current codebase, the codebase and the brand repository take precedence.

The root [`WORKSPACE_REMOVAL_REPORT.md`](../WORKSPACE_REMOVAL_REPORT.md) is a point-in-time report,
not a complete current API inventory. A deprecated workspace/project compatibility router remains
mounted. Use [`DOMAIN_MODEL.md`](DOMAIN_MODEL.md) and [`API_CONTRACTS.md`](API_CONTRACTS.md) for
current behavior.
