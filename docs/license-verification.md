# License Verification Process

This document defines how Vexart's source-available license is applied in practice during the v0.9 developer preview cycle.

## Summary

- Free use: personal projects, OSI-licensed open-source projects, and commercial entities under **$1M USD ARR**.
- Paid use: entities at or above **$1M USD ARR** must obtain a commercial license before shipping Vexart in a revenue-generating product.
- Enforcement is **honor-based**. There is no DRM or runtime license check.

## Commercial Tiers

- **Standard** — `$299 / developer / year`
- **Enterprise** — `$10,000 / year`, unlimited seats, written agreement required

Authoritative legal text lives in [`/LICENSE`](../LICENSE).

## Intake Workflow

1. Prospect contacts `license@vexart.dev`.
2. Founder classifies the request:
   - personal / OSS / sub-$1M ARR → free use
   - $1M+ ARR commercial product → Standard or Enterprise
3. Founder replies with:
   - the applicable tier
   - the current price
   - renewal terms
   - payment instructions
4. For Enterprise, founder issues a written agreement.

## Verification Checklist

Use this checklist before granting a paid commercial license:

- Legal entity name
- Billing contact
- Product name using Vexart
- Revenue band confirmation
- Required tier (Standard / Enterprise)
- Number of developers if Standard
- Any SLA / support expectations

## What We Do Not Do

- No online activation
- No telemetry-based enforcement
- No phone-home requirement
- No build-time watermarking

## Release Readiness Requirement

For v0.9, this process is considered documented when:

- `/LICENSE` contains the source-available terms
- this verification workflow exists in docs
- dist packaging points to the same license text
