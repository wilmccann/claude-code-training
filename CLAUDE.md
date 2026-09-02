# Claude Code Training — Repo Rescue

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Training repository for the Repo Rescue workshop. Learners take a ticket end to end against the Northwind Payments merchant console, then open a pull request here to be scored.

Context in this repo is layered on purpose, and the layering is part of what the workshop teaches:

| File | Scope | What belongs in it |
| --- | --- | --- |
| `CLAUDE.md` (this file) | Every session | What the repo is, where things live, how work is submitted |
| `build-battle/CLAUDE.md` | The exercise | The ticket, the order of operations, what is preloaded |
| `build-battle/merchant-console/CLAUDE.md` | The application | Codebase conventions and card rules |
| `build-battle/merchant-console/.claude/rules/*.md` | Matching files only | Detail that would be noise until you open that kind of file |

Read the narrowest one that applies before you write code.

## Commands

There is no `package.json` at the repository root. Every npm command runs from the app directory:

```bash
cd build-battle/merchant-console
npm install
npm run dev      # http://localhost:3000
npm test         # vitest, 28 tests across 3 files, well under a second
npm run build
npm run lint
```

Run a single test file, or a single test by name:

```bash
npx vitest run src/lib/csv.test.ts
npx vitest run -t "stamps the UTC date"
```

Tests are Vitest in a plain node environment with no DOM, and `vitest.config.ts` collects only `src/**/*.test.ts`. Component or route tests would need a jsdom environment that is not configured. The suite covers the money, date, and CSV helpers in `src/lib/`, which is where a quiet mistake costs real money.

From the repository root, `.claude/launch.json` starts the same dev server via `--prefix`, so preview tooling does not need the `cd`.

## Repository layout

- `docs/tickets/` — the tickets engineers work, written as they arrive on a sprint board
- `docs/specs/` — where plans go before code does, and the template they follow
- `docs/ORG-STANDARDS.md` — the org-wide engineering standards every service is measured against
- `.claude/` — the skills (`/spec`, `/pr`, `/ship-ready`) and the `bug-investigator` subagent. Open Claude Code at this root and they are available everywhere
- `build-battle/` — the exercise brief and the scoring rubric
- `build-battle/merchant-console/` — Northwind Payments, the application itself
- `.github/` — pull request template and the grading workflow

## How the application is put together

Read `build-battle/merchant-console/CLAUDE.md` before writing code. The shape that takes several files to see:

- **Next.js 15 App Router, React 19, TypeScript, Tailwind, Radix.** `@/` resolves to `src/`. Pages are server components that read the store directly, and `"use client"` appears only where there is real interaction, such as `src/app/payments/filter-bar.tsx`.
- **No database, and only two route handlers**, both under `src/app/api/payments/`. Everything else renders on the server. Persistence is NWP-203, so do not add a database, an ORM, or migrations.
- **Data flow.** `src/data/generate.ts` builds seed data at boot, `src/data/store.ts` holds it as a singleton on `globalThis` so the dev server's module reloading does not hand each request a fresh copy, and `src/data/queries.ts` is the one query builder that every list, export, and metric goes through.
- **The seed is deterministic and time-anchored.** `GENERATED_AT` is fixed at `2026-08-13T00:00:00Z` and the PRNG seed is a constant, so "the last 30 days" means the same thing on every machine and a bug reproduces identically for everyone.
- **`queryPayments` is filter, sort, and paginate in one call.** The CSV export route calls `filterPayments` and `sortPayments` separately and deliberately, because it must not paginate. Collapsing that into `queryPayments` silently reduces the export to the current page.
- **Filter state lives in the URL**, not in a client store. The filter bar pushes query params and the page re-renders from them.

## Conventions

- Plan before you build. `/spec` turns a ticket into a written plan that cites real files; it is scored.
- Read before you edit. A second implementation of an existing helper is a defect, not a shortcut.
- Never edit seed data to make a failing case disappear.
- Nothing in this repository may resemble real payment data. Generated card numbers use the `4242` test BIN.
- Defects in the merchant console are planted on purpose for training, as `build-battle/merchant-console/NOTICE` states. Fix what your ticket covers and report the rest; do not go on an opportunistic rewriting pass.
- `docs/ORG-STANDARDS.md` is the numbered, canonical form of the money, time, data-access, and masking rules. Reviewers cite it by item number, so "violates #1" is a finding and "looks wrong" is not.

## Submissions

Work is submitted as a pull request against this repository and scored automatically.

- Branch from `main` with the ticket ID: `NWP-201-issue-cards`
- Commit subjects carry the ticket ID: `NWP-201: issue virtual cards`
- Fill in the pull request template. The grader reads it.
- `.github/workflows/anthropic-tenex-reviewer.yml` is the live grader. It fires on `pull_request_target`, skips drafts until they are marked ready for review, and re-scores on every push, so the best run is the one that counts.
- `build-battle/.github/workflows/review.yml` is a self-contained reference implementation of a scorer. GitHub Actions only reads `.github/workflows/` at the repository root, so it does not run from where it sits.

## Release Standards

- **Test evidence before merging.** Every change carries proof it works: the command that was run and its output, named in the pull request. An assertion that it was tested is not evidence.
- **No direct commits to `main`.** Every change reaches `main` through a pull request, on a branch named for its ticket.
- **Every pull request states its business impact in one line.** Who is better off and how, in plain language, not a restatement of the diff.
