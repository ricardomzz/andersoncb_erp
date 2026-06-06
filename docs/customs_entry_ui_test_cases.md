# Customs Entry UI Test Cases

## Purpose
This file defines 50 synthetic test cases for manual entry through the ERPNext `Customs Entry` UI after the current production-shaped seed data is wiped and replaced with test credentials and test data.

These cases are designed to:
- cover the value patterns observed in the current production-shaped dataset
- avoid reusing real production names, bill numbers, invoice numbers, client refs, and party identifiers
- exercise the normalized `Shipment -> Invoice -> Article -> Tariff` data-entry path
- include realistic outliers such as new importers, new carriers, unseen ports, and unseen HTS codes

## Production-Derived Coverage Targets
These cases were designed to cover the value families present in the live production-shaped data currently in `site1.local`.

### Entry Types Observed
- `01` Consumption - Free & Dutiable
- `03` Consumption - AD/CVD
- `11` Informal - Free & Dutiable
- `21` Warehouse

### Transport Modes Observed
- `10` Vessel, Non-Containerized
- `11` Vessel, Containerized
- `21` Rail, Containerized
- `30` Truck, Non-Containerized
- `34` Road, Other
- `40` Air, Non-Containerized
- `60` Passenger, Hand Carried

### Payment Types Observed
- `2` Daily - Filer
- `3` Daily - Importer

### Bond Types Observed
- `8` Continuous
- `9` Single Transaction

### Structural Patterns Observed
- up to `3` shipments on one entry
- up to `5` invoices on one entry
- up to `14` articles on one entry
- up to `38` tariff lines on one entry

### HTS / Tariff Families Observed
The live data is heavily shaped by:
- base HTS only cases
- base HTS plus one Chapter 99 row
- base HTS plus two or more Chapter 99 rows
- paper / packaging style classifications
- furniture / home goods classifications
- rubber / tire classifications
- food / coffee / agriculture classifications
- wood / building material classifications
- plastics / consumer goods classifications
- vehicle / parts classifications

To honor the “do not reuse production identifiers” rule, the cases below use symbolic HTS placeholders. At execution time, each placeholder should be resolved to a valid HTS in the current test LDS environment.

## Placeholder Conventions

### Ports
Use symbolic ports in the test plan, then map them to valid ports in the currently connected LDS environment during execution.

- `PORT-EC-SEA-1`: high-volume East Coast seaport
- `PORT-EC-SEA-2`: second East Coast seaport
- `PORT-WC-SEA-1`: West Coast seaport
- `PORT-GULF-1`: Gulf seaport
- `PORT-AIR-1`: major air port
- `PORT-AIR-2`: second air port
- `PORT-RAIL-1`: rail port
- `PORT-ROAD-1`: truck / road port
- `PORT-NEW-1`: valid port not currently represented in the local seed

### HTS Archetypes
Resolve each symbolic HTS to a valid current-environment HTS code at execution time.

- `HTS-BASE-PAPER-01`
- `HTS-BASE-FURNITURE-01`
- `HTS-BASE-TIRE-01`
- `HTS-BASE-FOOD-01`
- `HTS-BASE-COFFEE-01`
- `HTS-BASE-WOOD-01`
- `HTS-BASE-PLASTIC-01`
- `HTS-BASE-AUTO-01`
- `HTS-BASE-MARINE-01`
- `HTS-BASE-CONSUMER-01`
- `HTS-CH99-A`
- `HTS-CH99-B`
- `HTS-CH99-C`
- `HTS-NEW-01`: valid HTS available in the target LDS environment but not used in the local seed dataset

### Synthetic Master Data
- Importers: `IMP-ALPHA-*`, `IMP-BRAVO-*`, `IMP-CHARLIE-*`, etc.
- Carriers: `CAR-OCEAN-*`, `CAR-AIR-*`, `CAR-TRUCK-*`, `CAR-RAIL-*`, `CAR-HAND-*`
- Client refs: `UI-CASE-###`
- Invoice numbers: `INV-###-X`
- House bills: `HB-###-X`
- Master bills: `MB-###-X`

## Case Template Rules
Unless a case says otherwise:
- create a brand-new draft `Customs Entry`
- create or select the referenced importer profile
- create or select the referenced carrier
- use one shipment unless the case explicitly says multi-shipment
- use one invoice unless the case explicitly says multi-invoice
- create at least one article for each invoice
- create tariff rows in article context
- ensure all required header, shipment, invoice, article, and tariff fields are filled

---

## 50 Test Cases

| ID | Focus | Entry Type | Transport | Pay / Bond | Structure | Master Data | HTS Pattern | Port Pattern | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Baseline ocean containerized consumption | `01` | `11` | `2 / 8` | `1 ship / 1 inv / 1 art / 2 tariffs` | new importer `IMP-ALPHA-01`, new carrier `CAR-OCEAN-01` | `HTS-BASE-PAPER-01 + HTS-CH99-A` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Establish baseline happy path. |
| 02 | Ocean non-containerized consumption | `01` | `10` | `2 / 8` | `1 / 1 / 1 / 1` | reuse importer `IMP-ALPHA-01`, new carrier `CAR-OCEAN-02` | `HTS-BASE-WOOD-01` | `PORT-GULF-1 -> PORT-GULF-1` | Covers vessel non-containerized. |
| 03 | Rail containerized consumption | `01` | `21` | `2 / 8` | `1 / 1 / 2 / 2` | new importer `IMP-BRAVO-01`, new carrier `CAR-RAIL-01` | `HTS-BASE-PLASTIC-01` and `HTS-BASE-CONSUMER-01` | `PORT-RAIL-1 -> PORT-EC-SEA-2` | Two articles under one invoice. |
| 04 | Truck non-containerized consumption | `01` | `30` | `2 / 8` | `1 / 1 / 1 / 1` | new importer `IMP-CHARLIE-01`, new carrier `CAR-TRUCK-01` | `HTS-BASE-FOOD-01` | `PORT-ROAD-1 -> PORT-ROAD-1` | Road freight baseline. |
| 05 | Road other consumption | `01` | `34` | `2 / 8` | `1 / 1 / 1 / 1` | reuse importer `IMP-CHARLIE-01`, new carrier `CAR-TRUCK-02` | `HTS-BASE-CONSUMER-01` | `PORT-ROAD-1 -> PORT-AIR-1` | Covers `34` specifically. |
| 06 | Air consumption | `01` | `40` | `2 / 8` | `1 / 1 / 2 / 3` | new importer `IMP-DELTA-01`, new carrier `CAR-AIR-01` | `HTS-BASE-AUTO-01 + HTS-CH99-B` | `PORT-AIR-1 -> PORT-AIR-1` | Multi-tariff air case. |
| 07 | Hand-carried consumption | `01` | `60` | `2 / 8` | `1 / 1 / 1 / 1` | new importer `IMP-ECHO-01`, new carrier `CAR-HAND-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-2 -> PORT-AIR-2` | Small passenger-borne shipment. |
| 08 | AD/CVD ocean containerized | `03` | `11` | `2 / 8` | `1 / 1 / 1 / 2` | new importer `IMP-FOXTROT-01`, reuse `CAR-OCEAN-01` | `HTS-BASE-FURNITURE-01 + HTS-CH99-A` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Entry type `03` baseline. |
| 09 | AD/CVD ocean non-containerized | `03` | `10` | `2 / 8` | `1 / 1 / 1 / 1` | reuse importer `IMP-FOXTROT-01`, reuse `CAR-OCEAN-02` | `HTS-BASE-WOOD-01` | `PORT-GULF-1 -> PORT-GULF-1` | Non-containerized AD/CVD. |
| 10 | AD/CVD rail | `03` | `21` | `2 / 8` | `1 / 1 / 2 / 3` | new importer `IMP-GOLF-01`, reuse `CAR-RAIL-01` | `HTS-BASE-TIRE-01 + HTS-CH99-B` | `PORT-RAIL-1 -> PORT-EC-SEA-2` | Rail with Chapter 99 overlay. |
| 11 | AD/CVD truck | `03` | `30` | `2 / 8` | `1 / 2 / 2 / 2` | new importer `IMP-HOTEL-01`, reuse `CAR-TRUCK-01` | `HTS-BASE-PLASTIC-01` | `PORT-ROAD-1 -> PORT-ROAD-1` | Two invoices under one shipment. |
| 12 | AD/CVD road other | `03` | `34` | `2 / 8` | `1 / 1 / 1 / 2` | reuse importer `IMP-HOTEL-01`, reuse `CAR-TRUCK-02` | `HTS-BASE-CONSUMER-01 + HTS-CH99-C` | `PORT-ROAD-1 -> PORT-AIR-1` | Road-other AD/CVD. |
| 13 | AD/CVD air | `03` | `40` | `2 / 8` | `1 / 1 / 3 / 4` | new importer `IMP-INDIA-01`, reuse `CAR-AIR-01` | mixed `HTS-BASE-AUTO-01`, `HTS-BASE-PLASTIC-01`, `HTS-CH99-A` | `PORT-AIR-1 -> PORT-AIR-1` | Three articles under one invoice. |
| 14 | AD/CVD hand-carried | `03` | `60` | `2 / 8` | `1 / 1 / 1 / 1` | new importer `IMP-JULIET-01`, reuse `CAR-HAND-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-2 -> PORT-AIR-2` | Rare but supported mode/type pairing. |
| 15 | Informal ocean containerized | `11` | `11` | `3 / 9` | `1 / 1 / 1 / 1` | new importer `IMP-KILO-01`, reuse `CAR-OCEAN-01` | `HTS-BASE-COFFEE-01` | `PORT-EC-SEA-2 -> PORT-EC-SEA-2` | Informal entry baseline. |
| 16 | Informal ocean non-containerized | `11` | `10` | `3 / 9` | `1 / 1 / 1 / 1` | reuse importer `IMP-KILO-01`, reuse `CAR-OCEAN-02` | `HTS-BASE-MARINE-01` | `PORT-GULF-1 -> PORT-GULF-1` | Informal + vessel non-containerized. |
| 17 | Informal rail | `11` | `21` | `3 / 9` | `1 / 1 / 2 / 2` | new importer `IMP-LIMA-01`, reuse `CAR-RAIL-01` | `HTS-BASE-CONSUMER-01` and `HTS-BASE-PLASTIC-01` | `PORT-RAIL-1 -> PORT-EC-SEA-1` | Informal multi-article rail case. |
| 18 | Informal truck | `11` | `30` | `3 / 9` | `1 / 1 / 1 / 1` | new importer `IMP-MIKE-01`, reuse `CAR-TRUCK-01` | `HTS-BASE-FOOD-01` | `PORT-ROAD-1 -> PORT-ROAD-1` | Small informal truck entry. |
| 19 | Informal road other | `11` | `34` | `3 / 9` | `1 / 1 / 1 / 1` | reuse importer `IMP-MIKE-01`, reuse `CAR-TRUCK-02` | `HTS-BASE-CONSUMER-01` | `PORT-ROAD-1 -> PORT-AIR-2` | Informal road-other variation. |
| 20 | Informal air | `11` | `40` | `3 / 9` | `1 / 1 / 2 / 2` | new importer `IMP-NOVEMBER-01`, reuse `CAR-AIR-01` | `HTS-BASE-CONSUMER-01 + HTS-CH99-A` | `PORT-AIR-2 -> PORT-AIR-2` | Informal air with two articles. |
| 21 | Informal hand-carried | `11` | `60` | `3 / 9` | `1 / 1 / 1 / 1` | new importer `IMP-OSCAR-01`, reuse `CAR-HAND-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-2 -> PORT-AIR-2` | Mirrors the rare production mode. |
| 22 | Warehouse ocean containerized | `21` | `11` | `2 / 8` | `1 / 1 / 1 / 1` | new importer `IMP-PAPA-01`, reuse `CAR-OCEAN-01` | `HTS-BASE-FURNITURE-01` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Covers the lone warehouse type in production. |
| 23 | Warehouse air | `21` | `40` | `2 / 8` | `1 / 1 / 1 / 1` | reuse importer `IMP-PAPA-01`, reuse `CAR-AIR-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-1 -> PORT-AIR-1` | Outlier warehouse + air case. |
| 24 | Warehouse truck | `21` | `30` | `2 / 8` | `1 / 1 / 1 / 1` | reuse importer `IMP-PAPA-01`, reuse `CAR-TRUCK-01` | `HTS-BASE-PLASTIC-01` | `PORT-ROAD-1 -> PORT-ROAD-1` | Outlier warehouse + truck case. |
| 25 | New importer, existing carrier | `01` | `11` | `2 / 8` | `1 / 1 / 1 / 1` | create new importer `IMP-QUEBEC-NEW-01`, reuse `CAR-OCEAN-01` | `HTS-BASE-PAPER-01` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Confirms local draft importer creation. |
| 26 | Existing importer, new carrier | `01` | `40` | `2 / 8` | `1 / 1 / 1 / 1` | reuse `IMP-ALPHA-01`, create `CAR-AIR-NEW-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-1 -> PORT-AIR-1` | Confirms local draft carrier creation. |
| 27 | New importer and new carrier together | `03` | `21` | `2 / 8` | `1 / 1 / 2 / 2` | create `IMP-ROMEO-NEW-01`, create `CAR-RAIL-NEW-01` | `HTS-BASE-TIRE-01 + HTS-CH99-B` | `PORT-RAIL-1 -> PORT-EC-SEA-2` | Dual new master-data path. |
| 28 | New port not in local seed | `01` | `30` | `2 / 8` | `1 / 1 / 1 / 1` | reuse existing importer/carrier | `HTS-BASE-FOOD-01` | `PORT-NEW-1 -> PORT-NEW-1` | Resolve against current test LDS at execution time. |
| 29 | New HTS not in local seed | `01` | `11` | `2 / 8` | `1 / 1 / 1 / 1` | reuse existing importer/carrier | `HTS-NEW-01` | `PORT-EC-SEA-2 -> PORT-EC-SEA-2` | Valid new tariff not currently in local seed. |
| 30 | One shipment, two invoices | `01` | `11` | `2 / 8` | `1 / 2 / 2 / 2` | reuse `IMP-BRAVO-01`, reuse `CAR-OCEAN-01` | `HTS-BASE-PAPER-01`, `HTS-BASE-PLASTIC-01` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Exercises invoice linking under one shipment. |
| 31 | One shipment, three invoices | `03` | `40` | `2 / 8` | `1 / 3 / 3 / 4` | reuse `IMP-INDIA-01`, reuse `CAR-AIR-01` | mixed base + Chapter 99 | `PORT-AIR-1 -> PORT-AIR-1` | Matches higher invoice count patterns. |
| 32 | Two shipments, one invoice each | `01` | `30` | `3 / 9` | `2 / 2 / 2 / 2` | reuse `IMP-CHARLIE-01`, reuse `CAR-TRUCK-01` | `HTS-BASE-FOOD-01` and `HTS-BASE-CONSUMER-01` | `PORT-ROAD-1 -> PORT-ROAD-1` | Multi-shipment basic split. |
| 33 | Two shipments, mixed carriers | `01` | `11` and `30` | `2 / 8` | `2 / 2 / 3 / 4` | reuse importer, use `CAR-OCEAN-01` and `CAR-TRUCK-01` | mixed base + one Chapter 99 | `PORT-EC-SEA-1` and `PORT-ROAD-1` | Confirms shipment-level carrier independence. |
| 34 | Three shipments in one entry | `01` | mixed `11/30/40` | `2 / 8` | `3 / 3 / 3 / 3` | reuse `IMP-ALPHA-01`, mixed existing carriers | three different base HTS families | mixed port archetypes | Matches max shipment shape seen in production. |
| 35 | One invoice, four articles | `03` | `11` | `2 / 8` | `1 / 1 / 4 / 5` | reuse `IMP-FOXTROT-01`, reuse `CAR-OCEAN-01` | multiple commodity families | `PORT-EC-SEA-2 -> PORT-EC-SEA-2` | Stresses article entry workflow. |
| 36 | One invoice, seven articles | `01` | `40` | `2 / 8` | `1 / 1 / 7 / 8` | reuse `IMP-DELTA-01`, reuse `CAR-AIR-01` | mixed base and Chapter 99 | `PORT-AIR-1 -> PORT-AIR-1` | Mid-range article-heavy case. |
| 37 | One entry with 12 articles | `01` | `11` | `2 / 8` | `1 / 3 / 12 / 18` | reuse existing importer/carrier | broad commodity mix | `PORT-WC-SEA-1 -> PORT-EC-SEA-1` | Mirrors upper production article volume. |
| 38 | One entry with 14 articles | `03` | `11` | `2 / 8` | `1 / 4 / 14 / 20` | reuse existing importer/carrier | broad commodity mix with Chapter 99 overlays | `PORT-WC-SEA-1 -> PORT-EC-SEA-2` | Matches current max article count. |
| 39 | One article with three tariffs | `01` | `11` | `2 / 8` | `1 / 1 / 1 / 3` | reuse importer/carrier | `HTS-BASE-PAPER-01 + HTS-CH99-A + HTS-CH99-B` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Core Chapter 99 layering case. |
| 40 | One article with four tariffs | `03` | `21` | `2 / 8` | `1 / 1 / 1 / 4` | reuse importer/carrier | `HTS-BASE-TIRE-01 + HTS-CH99-A + HTS-CH99-B + HTS-CH99-C` | `PORT-RAIL-1 -> PORT-EC-SEA-1` | Heavy article-level tariff stacking. |
| 41 | Multi-article, mixed tariff depths | `01` | `40` | `2 / 8` | `1 / 1 / 3 / 7` | reuse importer/carrier | article 1 base only, article 2 base + 1 CH99, article 3 base + 2 CH99 | `PORT-AIR-2 -> PORT-AIR-2` | Confirms uneven tariff distribution across articles. |
| 42 | High tariff-count stress case | `03` | `11` | `2 / 8` | `1 / 2 / 8 / 24` | reuse importer/carrier | repeat family mix across many articles | `PORT-WC-SEA-1 -> PORT-EC-SEA-1` | Approaches production high-tariff entries. |
| 43 | Payment type 3 baseline | `01` | `11` | `3 / 8` | `1 / 1 / 1 / 1` | reuse `IMP-ALPHA-01`, reuse `CAR-OCEAN-01` | `HTS-BASE-PAPER-01` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Confirms `Daily - Importer` flow. |
| 44 | Single transaction bond baseline | `01` | `40` | `2 / 9` | `1 / 1 / 1 / 1` | reuse `IMP-DELTA-01`, reuse `CAR-AIR-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-1 -> PORT-AIR-1` | Confirms bond type `9`. |
| 45 | Payment type 3 plus bond type 9 | `03` | `30` | `3 / 9` | `1 / 1 / 2 / 2` | reuse `IMP-HOTEL-01`, reuse `CAR-TRUCK-01` | `HTS-BASE-FOOD-01 + HTS-CH99-C` | `PORT-ROAD-1 -> PORT-ROAD-1` | Combined less-common payment/bond pairing. |
| 46 | Port of entry differs from unlading | `01` | `11` | `2 / 8` | `1 / 1 / 1 / 1` | reuse importer/carrier | `HTS-BASE-FURNITURE-01` | `PORT-WC-SEA-1 -> PORT-EC-SEA-1` | Explicitly covers distinct entry and unlading ports. |
| 47 | Shipment origin/export diversity | `03` | `11` | `2 / 8` | `1 / 1 / 2 / 3` | reuse importer/carrier | two articles, different country-of-export / origin combos | `PORT-WC-SEA-1 -> PORT-EC-SEA-2` | Focuses on article origin/export fields. |
| 48 | Reuse importer across very different modes | `01` | `21` | `2 / 8` | `1 / 1 / 1 / 1` | reuse `IMP-ALPHA-01`, reuse `CAR-RAIL-01` | `HTS-BASE-PLASTIC-01` | `PORT-RAIL-1 -> PORT-EC-SEA-1` | Confirms importer reuse is mode-agnostic. |
| 49 | Reuse carrier across multiple importers | `01` | `40` | `2 / 8` | `1 / 1 / 1 / 1` | new importer `IMP-SIERRA-01`, reuse `CAR-AIR-01` | `HTS-BASE-CONSUMER-01` | `PORT-AIR-2 -> PORT-AIR-2` | Confirms carrier reuse with new party data. |
| 50 | Full mixed-complexity capstone | `03` | mixed `11/40/30` | `3 / 9` | `3 / 5 / 14 / 24+` | mix of reused and one new importer/carrier | broad family mix including `HTS-NEW-01` and multiple Chapter 99 overlays | mix of existing archetypes plus `PORT-NEW-1` | End-to-end stress case approximating the largest production-style patterns without reusing production identifiers. |

---

## Additional Relevance Notes
These fields should be explicitly populated during execution whenever the UI exposes them:
- `client_ref`
- `estimated_entry_date`
- `preliminary_statement_print_date` only if the UI allows it for local drafts, otherwise leave system-derived
- `conveyance_name`
- `trip_identifier`
- `house_bill`
- `master_bill`
- shipment-level `port_of_entry`
- shipment-level `port_of_unlading`
- article `country_of_origin`
- article `country_of_export`
- article `line_item_identifier`
- article `gross_weight`
- article `entered_value`
- article-level `harbor_maintenance_fee`
- article-level `merchandise_processing_fee`

These patterns also deserve attention during UI execution:
- same importer reused across multiple entries
- same carrier reused across multiple entries
- different carrier per shipment on a multi-shipment entry
- invoice-to-shipment linkage
- article-to-invoice linkage
- tariff-to-article linkage
- base HTS with no Chapter 99
- base HTS with one Chapter 99
- base HTS with multiple Chapter 99 rows
- valid new lookup values not present in the local seed

## Execution Goal Text
Use this exact goal when you want me to drive the UI testing run:

> Successfully enter all 50 synthetic Customs Entry test cases and 25 additional generic customs brokerage cases from `/opt/frappe-bench/apps/andersoncb_erp/docs/customs_entry_ui_test_cases.md` through the ERPNext UI against the currently connected LDS test environment, resolving symbolic ports and HTS placeholders to valid current-environment values as needed, creating any required new importer and carrier master data locally, and iterating until every case can be saved and submitted successfully. For each case, verify by reading the resulting LDS record back that every intended data point made it to LDS correctly, including header fields, shipment data, invoice data, article data, tariff data, and party linkages. If the database needs to be wiped and reseeded between runs to reach a clean result, do that as part of the process. While doing so, document every meaningful friction point in the data-entry workflow and propose corresponding UI improvements, validation improvements, and automations that would make this work faster and less error-prone for an operator.

## Acceptance Criteria For That Goal
- all 50 core cases and 25 generic cases are entered through the UI, not by direct database manipulation
- each symbolic placeholder is mapped to a valid value in the active test environment at execution time
- no production party names, invoice numbers, client refs, bills, or local identifiers are reused
- every transport mode observed in production is exercised
- every entry type observed in production is exercised
- both payment types and both bond types observed in production are exercised
- single-shipment, multi-shipment, single-invoice, multi-invoice, single-article, multi-article, and multi-tariff flows are all exercised
- new importer, new carrier, new HTS, and new port scenarios are included
- every case is verified against the saved LDS record, not just the ERPNext draft or submit response
- header, shipment, invoice, article, tariff, and master-data link fields match the intended test-case values in LDS
- defects found during entry or LDS round-trip verification are fixed and retested until all cases pass
- all meaningful operator friction points encountered during the run are documented
- each friction point includes at least one concrete recommendation for UI improvements, validation/defaulting improvements, or automations that would reduce daily operator effort

---

## 25 Additional Generic Customs Brokerage Cases
These 25 cases are intentionally broader than the current production-shaped dataset. They may not all map to your present organization or present LDS mix, but they are useful for hardening a generic customs brokerage workflow and identifying where the UI may need more flexibility.

| ID | Focus | Entry Type | Transport | Pay / Bond | Structure | Master Data | HTS Pattern | Port Pattern | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | Informal low-value e-commerce parcel | `11` | `40` | `3 / 9` | `1 / 1 / 1 / 1` | new small importer, express air carrier | `HTS-BASE-CONSUMER-01` | `PORT-AIR-1 -> PORT-AIR-1` | Tests lightweight parcel workflow. |
| G02 | Single entry for seasonal apparel assortment | `01` | `11` | `2 / 8` | `1 / 2 / 10 / 16` | apparel importer, ocean carrier | mixed apparel base HTS plus Chapter 99 overlays | `PORT-WC-SEA-1 -> PORT-EC-SEA-1` | Large SKU assortment in one filing. |
| G03 | Refrigerated food import | `01` | `11` | `2 / 8` | `1 / 1 / 3 / 3` | food importer, reefer-capable carrier | `HTS-BASE-FOOD-01` | `PORT-EC-SEA-2 -> PORT-EC-SEA-2` | Useful if cold-chain metadata ever appears. |
| G04 | Coffee importer with multiple source countries | `01` | `11` | `2 / 8` | `1 / 1 / 4 / 4` | coffee importer | `HTS-BASE-COFFEE-01` | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Emphasizes article origin differences. |
| G05 | Automotive parts with many Chapter 99 overlays | `03` | `30` | `2 / 8` | `1 / 2 / 6 / 14` | auto parts importer, truck carrier | `HTS-BASE-AUTO-01 + multiple CH99` | `PORT-ROAD-1 -> PORT-ROAD-1` | Heavy tariff overlay scenario. |
| G06 | Hazard-adjacent chemical goods | `01` | `30` | `2 / 9` | `1 / 1 / 2 / 2` | specialty chemical importer | `HTS-BASE-PLASTIC-01` or other valid chemical-family HTS | `PORT-ROAD-1 -> PORT-ROAD-1` | Good generic brokerage edge case even if not current focus. |
| G07 | Warehouse entry with later release planning | `21` | `11` | `2 / 8` | `1 / 1 / 3 / 3` | warehouse-focused importer | mixed durable goods HTS | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Keeps warehouse workflow in broader set. |
| G08 | Multi-buyer consolidated ocean shipment | `01` | `11` | `2 / 8` | `1 / 4 / 8 / 10` | one importer, several invoice groupings | mixed consumer and home-goods HTS | `PORT-WC-SEA-1 -> PORT-EC-SEA-2` | Good invoice/article linkage stress case. |
| G09 | Rail move with split invoices by vendor | `01` | `21` | `2 / 8` | `1 / 3 / 5 / 6` | one importer, rail carrier | mixed base HTS | `PORT-RAIL-1 -> PORT-EC-SEA-1` | Generic inland supply chain pattern. |
| G10 | Border truck shipment with same-day draft creation | `01` | `30` | `3 / 9` | `1 / 1 / 2 / 2` | trucking carrier reused, new importer | `HTS-BASE-FOOD-01` | `PORT-ROAD-1 -> PORT-ROAD-1` | Fast-turn operator workflow. |
| G11 | Air shipment with extremely short description lines | `01` | `40` | `2 / 8` | `1 / 1 / 3 / 3` | air carrier | mixed small electronics / consumer goods | `PORT-AIR-1 -> PORT-AIR-1` | Useful for description UX and grid scanning. |
| G12 | Entry with five invoices and one shipment | `01` | `11` | `2 / 8` | `1 / 5 / 10 / 12` | ocean carrier | broad mixed base HTS | `PORT-EC-SEA-1 -> PORT-EC-SEA-1` | Matches max invoice density. |
| G13 | Entry with three shipments and two carriers | `01` | mixed `11/30/40` | `2 / 8` | `3 / 3 / 6 / 8` | one importer, multiple carriers | mixed families | mixed port archetypes | Generic split-routing case. |
| G14 | Entry with one very high article count and repeated HTS | `01` | `11` | `2 / 8` | `1 / 2 / 14 / 14` | importer reused | repeated base HTS across many articles | `PORT-WC-SEA-1 -> PORT-EC-SEA-1` | Tests fast repetitive entry flow. |
| G15 | Entry with one article and many tariff overlays | `03` | `40` | `2 / 8` | `1 / 1 / 1 / 6` | importer reused | one base HTS plus many Chapter 99-like overlays | `PORT-AIR-2 -> PORT-AIR-2` | Good tariff stacking stress test. |
| G16 | New broker onboarding scenario | `01` | `30` | `2 / 8` | `1 / 1 / 1 / 1` | new importer, new carrier, new port, new HTS | `HTS-NEW-01` | `PORT-NEW-1 -> PORT-NEW-1` | End-to-end greenfield setup. |
| G17 | Same importer across sea, rail, and truck in one test batch | `01` | varied | varied | `3 separate entries` | one importer, 3 carriers | family-specific HTS | varied | Good for master-data reuse behavior. |
| G18 | Same carrier reused for three unrelated importers | `01` | `40` | `2 / 8` | `3 separate entries` | one carrier, 3 importers | mixed base HTS | `PORT-AIR-1 -> PORT-AIR-1` | Good for carrier reuse and search UX. |
| G19 | Commodity with no Chapter 99 overlays at all | `01` | `11` | `2 / 8` | `1 / 1 / 4 / 4` | importer reused | base HTS only | `PORT-EC-SEA-2 -> PORT-EC-SEA-2` | Confirms simple tariff path remains efficient. |
| G20 | Commodity where every article has a Chapter 99 overlay | `03` | `11` | `2 / 8` | `1 / 2 / 6 / 12` | importer reused | each article base HTS + one CH99 | `PORT-WC-SEA-1 -> PORT-EC-SEA-2` | Opposite of G19. |
| G21 | Generic marine / inflatable goods case | `01` | `10` | `2 / 8` | `1 / 1 / 2 / 2` | ocean carrier | `HTS-BASE-MARINE-01` | `PORT-GULF-1 -> PORT-GULF-1` | Non-containerized vessel example. |
| G22 | Generic building materials case | `01` | `11` | `2 / 8` | `1 / 2 / 5 / 6` | importer reused | `HTS-BASE-WOOD-01` and `HTS-BASE-PLASTIC-01` | `PORT-WC-SEA-1 -> PORT-EC-SEA-1` | Useful for heavier invoice/article sets. |
| G23 | Generic agriculture / seed / grain style case | `01` | `30` | `3 / 9` | `1 / 1 / 3 / 3` | importer reused | valid agricultural-family HTS | `PORT-ROAD-1 -> PORT-ROAD-1` | Broader brokerage applicability. |
| G24 | Generic medical / regulated consumer goods style case | `03` | `40` | `2 / 9` | `1 / 1 / 2 / 3` | importer reused | valid controlled-family HTS | `PORT-AIR-1 -> PORT-AIR-1` | Useful if stricter validations are added later. |
| G25 | Generic branch-office operator stress run | `01` | mixed | mixed | `2 shipments / 4 invoices / 8 articles / 12 tariffs` | one new importer, one reused importer, multiple carriers | mixed base and new HTS | mixed existing and new ports | Simulates a busy day with varied tasks in one filing set. |
