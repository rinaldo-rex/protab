# Implementation specifications

These specifications turn the product decisions and delivery roadmap into phase-sized implementation contracts.

## Document precedence

When documents disagree, use this order:

1. [`design_decisions.md`](../design_decisions.md) for product behavior
2. The phase's `what.md` for scope and acceptance criteria
3. The phase's `how.md` for implementation boundaries
4. [`development_phases.md`](../development_phases.md) for sequence
5. Stitch artifacts for visual direction only

The generated Stitch HTML is a reference, not production code. Features shown there that are deferred by the product documents must not be implemented early.

## Readiness

| Phase | What | How | Implementation depends on |
|---|---|---|---|
| [Phase 1](phase-1/what.md) | **Complete** ([evidence](../docs/phase-1-completion.md)) | [Implemented](phase-1/how.md) | — |
| [Phase 2](phase-2/what.md) | **Implemented** ([evidence](../docs/phase-2-completion.md)) | [Implemented](phase-2/how.md) | Completed Phase 1 contracts and code |
| [Phase 3](phase-3/what.md) | **Implemented** | [Implemented](phase-3/how.md) | Completed Phase 2 interfaces and approved close policy |
| [Phase 4](phase-4/what.md) | **Implemented** | [Implemented](phase-4/how.md) | Phase 3 shared close workflow |
| [Phase 4A](phase-4a/what.md) | **Ready for testing** | [Implemented](phase-4a/how.md) | Completed Phase 4 |
| [Phase 5](phase-5/what.md) | Ready | Write after Phase 4A | Phase 4A |

## Handoff rule

Implement one phase at a time and preserve the atomic commit sequence in its `how.md`. A phase is complete only when its automated checks pass, its manual checklist is completed, and its acceptance criteria are demonstrable in the built extension.

The product-facing `what.md` contracts may be prepared ahead of time. Write each `how.md` only after the preceding phase is complete so it can reference real interfaces instead of predicting them.

## Visual references

- [`screen.png`](../stitch_core_artifacts/screen.png) — desktop composition reference
- [`DESIGN.md`](../stitch_core_artifacts/DESIGN.md) — visual tokens and principles
- [`code.html`](../stitch_core_artifacts/code.html) — generated layout reference; do not copy its CDN dependencies or deferred features
