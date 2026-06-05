from datetime import datetime, timedelta
from types import SimpleNamespace

from andersoncb_erp.services import sync as sync_module


NAMESPACED_PSC_XML = """<GetResult xmlns:a='http://schemas.datacontract.org/2004/07/SMS.Broker.DataContracts.Documents'><a:PostSummaryCorrection>true</a:PostSummaryCorrection><a:PostSummaryCorrectionAcceleratedLiquidation>true</a:PostSummaryCorrectionAcceleratedLiquidation></GetResult>"""


def test_should_run_scheduled_sync_respects_frequency_and_enabled_flag():
    now = datetime(2026, 6, 4, 12, 0, 0)
    settings = SimpleNamespace(sync_enabled=1, sync_frequency_minutes=15, last_window_sync_finished_on=now - timedelta(minutes=16), last_window_sync_started_on=None)
    assert sync_module.should_run_scheduled_sync(settings, now) is True

    settings.sync_enabled = 0
    assert sync_module.should_run_scheduled_sync(settings, now) is False


def test_archive_entry_numbers_for_scope_only_returns_missing_rows():
    records = [
        {"entry_number": "A"},
        {"entry_number": "B"},
        {"entry_number": "C"},
    ]

    assert sync_module.archive_entry_numbers_for_scope(records, {"A", "C"}) == ["B"]


def test_derive_entry_status_prefers_lifecycle_dates_when_source_status_is_blank():
    assert sync_module.derive_entry_status({"entry_date": "2026-06-01"}) == "Entered"
    assert sync_module.derive_entry_status({"estimated_entry_date": "2026-06-02"}) == "Entered"
    assert sync_module.derive_entry_status({"entry_date": "2026-06-01", "filing_date": "2026-06-03"}) == "Filed"
    assert sync_module.derive_entry_status({"entry_date": "2026-06-01", "preliminary_statement_print_date": "2026-06-03"}) == "Filed"
    assert sync_module.derive_entry_status({"entry_date": "2026-06-01", "filing_date": "2026-06-03", "release_date": "2026-06-04"}) == "Released"



def test_derive_entry_status_ignores_psc_and_supports_archived_entries():
    assert sync_module.derive_entry_status({"raw_payload_xml": NAMESPACED_PSC_XML, "filing_date": "2026-06-03", "release_date": "2026-06-04"}) == "Released"
    assert sync_module.derive_entry_status({"entry_date": "2026-06-01"}, source_active=0) == "Archived"



def test_derive_entry_status_only_preserves_supported_source_status_values():
    assert sync_module.derive_entry_status({"status": "released"}) == "Released"
    assert sync_module.derive_entry_status({"status": "entry_status_pending", "entry_date": "2026-06-01"}) == "Entered"



def test_derive_psc_status_supports_none_psc_and_accelerated_psc():
    assert sync_module.derive_psc_status({}) == "None"
    assert sync_module.derive_psc_status({"raw_payload_xml": "<PostSummaryCorrection>true</PostSummaryCorrection>"}) == "PSC"
    assert sync_module.derive_psc_status({"raw_payload_xml": NAMESPACED_PSC_XML}) == "PSC Accelerated Liquidation"



def test_derive_liquidation_status_supports_not_liquidated_and_liquidated():
    assert sync_module.derive_liquidation_status({}) == "Not Liquidated"
    assert sync_module.derive_liquidation_status({"liquidation_date": "2026-12-01", "raw_payload_xml": NAMESPACED_PSC_XML}) == "Liquidated"
