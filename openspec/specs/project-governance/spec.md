# Spec: project-governance

## Overview

This capability defines how Vexart is governed while the roadmap is executed. It establishes the master-document hierarchy, the mandatory SDD path for every change, the required repository scaffolding, and the documentation hygiene needed so humans and AI agents operate from one authoritative context, per PRD §10.3, PRD §11 Phase 0, PRD §12 DEC-007, PRD Appendix A, ARCHITECTURE §1.3, and API-POLICY §1.

## Requirements

### REQ-PG-001: Master documents are authoritative

The repository MUST treat `docs/PRD.md` as the product source of truth, `docs/ARCHITECTURE.md` as the implementation-structure source of truth, and `docs/API-POLICY.md` as the public API source of truth, per PRD Appendix A, PRD §25-42, ARCHITECTURE §1.3, and API-POLICY §1. During execution of an approved phase, change artifacts MUST align to those documents rather than silently redefining them.

#### Scenario: Active change aligns to master docs

- **Given** `openspec/changes/<change-name>/proposal.md` or a downstream artifact exists
- **When** a reviewer checks the change for governing references
- **Then** the artifact cites the applicable master document and section number for the policy or contract it relies on
- **And** no conflicting rule is introduced only inside the change artifact

#### Scenario: Conflict is resolved in favor of master docs

- **Given** a change artifact conflicts with `docs/PRD.md`, `docs/ARCHITECTURE.md`, or `docs/API-POLICY.md`
- **When** the conflict is reviewed
- **Then** the master document wins for that phase
- **And** the change is blocked until the artifact is aligned or the master document is amended through its own governance path

### REQ-PG-002: Proposals cite PRD sections

Every change proposal MUST cite the `docs/PRD.md` section(s) it satisfies, per PRD §25-38 and `openspec/config.yaml` rules.proposal. Each citation MUST use an explicit section reference such as `docs/PRD.md §11` or `docs/PRD.md §7.3` so a reviewer can trace scope to product intent.

#### Scenario: Proposal includes traceable PRD references

- **Given** a new proposal under `openspec/changes/<change-name>/proposal.md`
- **When** the file is reviewed for completeness
- **Then** it contains at least one explicit `docs/PRD.md §...` citation
- **And** the cited section matches the proposal's stated scope or success criteria

#### Scenario: Proposal without PRD citations is rejected

- **Given** a proposal that describes work but contains no explicit PRD section citation
- **When** governance validation runs
- **Then** the proposal is non-compliant
- **And** the change MUST NOT proceed to implementation until the citation gap is fixed

### REQ-PG-003: SDD workflow is the only valid path for changes

Every Vexart change MUST follow the SDD workflow `propose → spec → design → tasks → apply → verify → archive`, per PRD §10.3, PRD §12 DEC-007, and PRD Appendix A. Direct repository work that bypasses this lifecycle SHALL be treated as out of process.

#### Scenario: Active change contains required upstream artifacts

- **Given** an active change folder at `openspec/changes/<change-name>/`
- **When** a reviewer inspects its lifecycle state
- **Then** the folder contains `proposal.md` before `specs/`, `design.md` before `tasks.md`, and `verify-report.md` before archive
- **And** missing predecessor artifacts block the next phase

#### Scenario: Completed change leaves an audit trail

- **Given** a completed change
- **When** it is archived
- **Then** it is moved under `openspec/changes/archive/YYYY-MM-DD-<change-name>/`
- **And** the archived folder preserves the phase artifacts as the audit trail for that change

### REQ-PG-004: Legacy pre-PRD documents are archived out of the root

Legacy pre-PRD documents MUST reside under `docs/archive/` and MUST NOT remain at the repository root, per PRD §11 Phase 0 and proposal scope. At minimum, `TGE-ARCHITECTURE-REPORT.md`, `TGE-AUDIT.md`, `TGE-ROADMAP.md`, `MIGRATION-ANALYSIS.md`, and `docs.md` MUST be archived there.

#### Scenario: Legacy docs are stored only in archive

- **Given** the repository documentation tree
- **When** a reviewer checks the legacy TGE document set
- **Then** each listed file exists under `docs/archive/`
- **And** no duplicate of those files exists at the repository root

#### Scenario: Root-level stale context is treated as non-compliant

- **Given** one of the listed legacy documents is present at the repository root
- **When** governance validation runs
- **Then** the repository is non-compliant
- **And** the document MUST be moved back under `docs/archive/` before the change is considered complete

### REQ-PG-005: AGENTS.md points agents to the master docs

The root `AGENTS.md` MUST identify `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/API-POLICY.md` as the authoritative sources for product, architecture, and API decisions, per PRD Appendix A and proposal scope. It SHOULD direct agents away from archived or legacy documents when authoritative guidance exists.

#### Scenario: AGENTS.md names the canonical references

- **Given** the repository root `AGENTS.md`
- **When** an agent-orientation review checks its guidance
- **Then** the file explicitly references the three master docs by path
- **And** it describes them as authoritative or source-of-truth material

### REQ-PG-006: OpenSpec scaffolding exists for governed execution

The repository MUST contain the OpenSpec scaffold required by DEC-007: `openspec/config.yaml`, `openspec/README.md`, `openspec/specs/`, `openspec/changes/`, and `openspec/changes/archive/`, per PRD §11 Phase 0, PRD §12 DEC-007, and PRD Appendix A. Change-specific artifacts MUST be placed under that structure, consistent with ARCHITECTURE §13.9.

#### Scenario: Required OpenSpec paths exist

- **Given** the repository root
- **When** governance validation checks SDD bootstrap state
- **Then** each required OpenSpec path exists
- **And** `openspec/config.yaml` is the governing config for phase rules

#### Scenario: Change artifacts live inside OpenSpec

- **Given** a change named `<change-name>`
- **When** its artifacts are created
- **Then** they are stored under `openspec/changes/<change-name>/`
- **And** equivalent phase artifacts are not stored in ad hoc root-level locations

### REQ-PG-007: Skill routing metadata exists for AI execution

The repository MUST include `.atl/skill-registry.md` as the AI skill-routing registry for the project, per PRD §10.3 and Phase 0 scope. The registry SHOULD identify the master docs and SDD workflow conventions that agents are expected to follow.

#### Scenario: Skill registry file exists

- **Given** the repository root
- **When** an AI-governance review checks onboarding metadata
- **Then** `.atl/skill-registry.md` exists
- **And** the file is readable as project-level agent guidance

#### Scenario: Skill registry reinforces governance context

- **Given** `.atl/skill-registry.md` exists
- **When** a reviewer checks its project conventions section
- **Then** it references the master docs or OpenSpec conventions that govern Vexart work
- **And** it does not position archived legacy docs as authoritative
