from __future__ import annotations

import frappe
from frappe.utils import now_datetime

from andersoncb_erp.integrations.lds import LDSClient
from andersoncb_erp.services.master_data import (
    parse_carrier_xml,
    parse_importer_profile_xml,
    upsert_carrier,
    upsert_importer_profile,
)


def get_party_client(settings=None) -> LDSClient:
    settings = settings or frappe.get_single('LDS Settings')
    return LDSClient.from_settings(settings)


def sync_importer_profiles(settings=None, client: LDSClient | None = None, page_size: int = 100) -> int:
    settings = settings or frappe.get_single('LDS Settings')
    client = client or get_party_client(settings)
    synced_on = now_datetime()
    count = 0
    for entity in client.iter_importer_contacts(page_size=page_size):
        parsed = parse_importer_profile_xml(entity.raw_xml)
        if not parsed:
            continue
        upsert_importer_profile(parsed, synced_on=synced_on)
        count += 1
    return count


def sync_carriers(settings=None, client: LDSClient | None = None, page_size: int = 100) -> int:
    settings = settings or frappe.get_single('LDS Settings')
    client = client or get_party_client(settings)
    synced_on = now_datetime()
    count = 0
    for entity in client.iter_carriers(page_size=page_size):
        parsed = parse_carrier_xml(entity.raw_xml)
        if not parsed:
            continue
        upsert_carrier(parsed, synced_on=synced_on)
        count += 1
    return count
