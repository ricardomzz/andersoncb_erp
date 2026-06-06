# Customs Entry UI Execution Prep

## Current Active Test Environment Snapshot
As of 2026-06-05, the site is configured to use:
- Endpoint URL: `https://smstest.logisticaldatasolutions.com:8130/brokerservice`
- Username: `MAZZINI@betatest`
- Default filer code: `SY1`

This snapshot is only intended as execution prep. It should be rechecked after any credential or environment change.

## Placeholder Resolution Strategy
During the UI validation run:
- Ports should be resolved by current-environment `CustomsPortManager/GetByCode`
- HTS codes should be resolved by current-environment `HarmonizedTariffManager/GetByCode`
- Importers should be created locally using synthetic values unless an existing synthetic importer from the same run is intentionally reused
- Carriers should be created locally using synthetic values unless an existing synthetic carrier from the same run is intentionally reused

## Current Test-Environment Port Candidates
These are concrete candidate mappings for the symbolic ports in `/opt/frappe-bench/apps/andersoncb_erp/docs/customs_entry_ui_test_cases.md`.

| Symbolic Port | Candidate Code | Port Name | City | State | Notes |
| --- | --- | --- | --- | --- | --- |
| `PORT-EC-SEA-1` | `4601` | `NEW YORKNEWARK AREA` | `NEWARK` | `NJ` | Good East Coast seaport default. |
| `PORT-EC-SEA-2` | `1303` | `BALTIMORE MD` | `BALTIMORE` | `MD` | Good second East Coast seaport. |
| `PORT-WC-SEA-1` | `2704` | `LOS ANGELES CA` | `LONG BEACH` | `CA` | Good West Coast seaport. |
| `PORT-GULF-1` | `1801` | `TAMPA FL` | `TAMPA` | `FL` | Reasonable Gulf-style candidate. |
| `PORT-AIR-1` | `2801` | `SAN FRANCISCO INTL AIRPO` | `SAN FRANCISCO` | `CA` | Good air-port candidate. |
| `PORT-AIR-2` | `1108` | `PHILA INTERNATIONAL AIR` | `PHILADELPHIA` | `PA` | Good second air-port candidate. |
| `PORT-RAIL-1` | `3901` | `CHICAGO IL` | `ROSEMONT` | `IL` | Practical inland / rail-style candidate. |
| `PORT-ROAD-1` | `0712` | `CHAMPLAIN-ROUSES POINT` | `CHAMPLAIN` | `NY` | Practical land-border road candidate. |
| `PORT-NEW-1` | `3303` | `SALT LAKE CITY UT` | `SALT LAKE CITY` | `UT` | Candidate intentionally outside the main production-shaped top ports. |

These are execution-prep candidates, not hard requirements. If a better current-environment match is available at execution time, use it and note the substitution in the friction log.

## Current Test-Environment HTS Candidates
These were verified as resolvable in the active test LDS environment.

| Symbolic HTS | Candidate Code | Candidate Description | UOM | Notes |
| --- | --- | --- | --- | --- |
| `HTS-BASE-PAPER-01` | `4819200040` | `OTHR NONCORRGTED PAPR FLDG CTN` | `KG` | Packaging / paper family. |
| `HTS-BASE-FURNITURE-01` | `9403409060` | `CABINETS,PERMANENT INSTAL,WOOD` | `NO` | Furniture / home-goods family. |
| `HTS-BASE-TIRE-01` | `4011201015` | `RUBBER,TIRES,BUS/TRUCK RADIALS` | `NO` | Tire / rubber family. |
| `HTS-BASE-FOOD-01` | `2106909998` | `OTH BEV PREP NT W/SUGR CNE/BET` | `KG` | Food / beverage-prep family. |
| `HTS-BASE-COFFEE-01` | `0901110025` | `ARABICA COFFEE,N/T CERT ORGANC` | `KG` | Coffee family. |
| `HTS-BASE-WOOD-01` | `4404200080` | `NOCONIFEROUS HOPWOD,POLE,PILES` | `KG` | Wood / building-material family. |
| `HTS-BASE-PLASTIC-01` | `3925900000` | `PLAST,BUILDERS WARE,OTHER` | `NO` | Plastic / building-material family. |
| `HTS-BASE-AUTO-01` | `8703230190` | `OTH MOT VE:USED;>1500&<=3000CC` | `NO` | Vehicle / auto family. |
| `HTS-BASE-MARINE-01` | `8907100000` | `INFLATABLE RAFT` | `NO` | Marine / inflatable family. |
| `HTS-BASE-CONSUMER-01` | `3925900000` | `PLAST,BUILDERS WARE,OTHER` | `NO` | Generic stand-in when a consumer-goods-specific code is not otherwise required. |
| `HTS-CH99-A` | `99038803` | `ARTICLE OF CHINA,US NTE 20(F)` | n/a | Valid Chapter 99 overlay. |
| `HTS-CH99-B` | `99030301` | `SECTION 122 - 10% DUTY` | n/a | Valid Chapter 99 / special-duty overlay. |
| `HTS-CH99-C` | `99030125` | description not returned by current manager response | n/a | Still resolvable by code in active test environment. |

## Known Resolution Notes
- Some Chapter 99 codes resolve successfully in the test environment even when the manager response does not include a human-readable name.
- The UI run should treat a successful LDS code resolution as authoritative even if the description comes back blank.
- `HTS-NEW-01` should be chosen at execution time from a valid test-environment HTS code not already used elsewhere in the run.
- Any time a placeholder is resolved differently than this prep file suggests, record the substitution in the friction log.

## Friction Log Template
Use this structure during execution:

| Case ID | Step | Friction Point | Impact | Workaround Used | Suggested UI Improvement | Suggested Validation / Defaulting | Suggested Automation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| example | shipment entry | shipment-to-invoice linkage is hard to see | slows article entry | manually re-open grids | show invoice context beside article rows | require invoice selection before tariff entry | copy shipment defaults into invoice creation |

## Round-Trip Verification Helper
A reusable verifier is now available through the app API:
- method: `andersoncb_erp.api.verify_entry_roundtrip`
- input: `name` of a `Customs Entry`
- behavior:
  - fetches the current ERPNext document
  - reads the saved LDS record back by `lds_id` when available, otherwise by entry number and filer code
  - parses the LDS XML into the same mapped structure used by sync
  - compares header, shipment, invoice, article, and tariff data
  - returns a structured mismatch report

Use this helper during execution after each submit, or at least after each completed batch, so verification is not done manually.
