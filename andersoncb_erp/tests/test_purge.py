from types import SimpleNamespace

from andersoncb_erp.services import purge


class FakeDB:
    def __init__(self, calls):
        self.calls = calls

    def exists(self, doctype, name):
        return True

    def get_value(self, doctype, name, fieldname):
        if name in {"CE-SYNC", "IMP-SYNC", "CAR-SYNC"} and fieldname == "docstatus":
            return 1
        return 0

    def set_value(self, doctype, name, values, update_modified=False):
        self.calls["set_value"].append((doctype, name, values))

    def commit(self):
        self.calls["committed"] = True


def test_purge_lds_synced_data_deletes_synced_docs_and_clears_remaining_links(monkeypatch):
    calls = {
        "deleted": [],
        "set_value": [],
        "committed": False,
    }

    data = {
        ("Customs Entry", frozenset({("lds_id", "is:set")})): ["CE-SYNC"],
        ("Importer Profile", frozenset({("lds_id", "is:set")})): ["IMP-SYNC"],
        ("Carrier", frozenset({("lds_id", "is:set")})): ["CAR-SYNC"],
    }

    def fake_get_all(doctype, filters=None, pluck=None, fields=None):
        if pluck == "name":
            normalized = frozenset((key, ":".join(value) if isinstance(value, list) else value) for key, value in (filters or {}).items())
            return data[(doctype, normalized)]
        if doctype == "Customs Entry":
            return [SimpleNamespace(name="TMPLOCAL", docstatus=0), SimpleNamespace(name="CE-SYNC", docstatus=1)]
        if doctype == "Entry Shipment":
            return [SimpleNamespace(name="SHIP-LOCAL", parent="TMPLOCAL"), SimpleNamespace(name="SHIP-SYNC", parent="CE-SYNC")]
        raise AssertionError((doctype, filters, pluck, fields))

    fake_frappe = SimpleNamespace(
        only_for=lambda role: None,
        get_all=fake_get_all,
        delete_doc=lambda doctype, name, ignore_permissions=False, force=None, delete_permanently=None: calls["deleted"].append((doctype, name)),
        db=FakeDB(calls),
    )

    monkeypatch.setattr(purge, "frappe", fake_frappe)

    result = purge.purge_lds_synced_data()

    assert result == {
        "deleted_customs_entries": 1,
        "deleted_importer_profiles": 1,
        "deleted_carriers": 1,
    }
    assert ("Customs Entry", "TMPLOCAL", {"importer_profile": None}) in calls["set_value"]
    assert ("Entry Shipment", "SHIP-LOCAL", {"carrier_profile": None}) in calls["set_value"]
    assert ("Customs Entry", "CE-SYNC") in calls["deleted"]
    assert ("Importer Profile", "IMP-SYNC") in calls["deleted"]
    assert ("Carrier", "CAR-SYNC") in calls["deleted"]
    assert calls["committed"] is True
