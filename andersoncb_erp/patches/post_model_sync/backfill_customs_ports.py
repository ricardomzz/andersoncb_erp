from __future__ import annotations

from andersoncb_erp.services.customs_port_directory import backfill_customs_ports_from_entries


def execute():
    backfill_customs_ports_from_entries()
