# Customs Entry UI Execution Log Template

Use this file as the working template during the UI validation run.

## Batch Metadata
- Run date:
- Site:
- LDS endpoint:
- LDS username:
- Default filer code:
- Database reset performed before run: yes / no
- Starting ERPNext state notes:
- Starting LDS state notes:

## Case Tracking Table
| Case ID | Type | UI Entry Started | UI Submit Succeeded | ERPNext Entry Name | LDS Entry Number | LDS Entity Id | Placeholder Ports Resolved | Placeholder HTS Resolved | Round-Trip Verification Status | Issues Found | Fix Applied | Retest Status | Friction Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | core |  |  |  |  |  |  |  |  |  |  |  |  |

## Per-Case Verification Checklist
For each case, verify all intended data points against the saved LDS record:
- Header
  - entry type
  - filer code
  - client ref
  - estimated entry date
  - port of entry
  - port of unlading
  - transport mode
  - conveyance name
  - trip identifier
  - payment type
  - bond type
  - surety code
  - bond number
  - house bill
  - master bill
- Party / master data
  - importer code / name
  - carrier code / name
  - any newly created synthetic importer or carrier linked correctly
- Shipments
  - shipment count
  - per-shipment mode
  - per-shipment carrier
  - per-shipment ports
  - arrival / import / export dates if entered
- Invoices
  - invoice count
  - invoice numbers
  - shipment linkage
  - amounts and currencies
- Articles
  - article count
  - invoice linkage
  - shipment linkage
  - description
  - line item identifier
  - country of origin
  - country of export
  - gross weight
  - entered value
  - MPF / HMF if entered
- Tariffs
  - tariff count
  - HTS codes
  - article linkage
  - quantities / UOM where applicable
  - Chapter 99 overlays where intended

## Friction Log
| Case ID | Step | Friction Point | Why It Matters | Workaround Used | Suggested UI Improvement | Suggested Validation / Defaulting | Suggested Automation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| example | article entry | shipment / invoice context is hard to keep visible while entering tariffs | increases rework and mis-linking risk | reopen invoice rows repeatedly | persistent side panel showing selected shipment and invoice context | require invoice selection before adding tariff rows | one-click clone article context into next article |

## Summary Section
- Cases completed:
- Cases blocked:
- Defects fixed during run:
- Remaining defects:
- Highest-friction workflow areas:
- Recommended UI improvements:
- Recommended validation changes:
- Recommended automations:
