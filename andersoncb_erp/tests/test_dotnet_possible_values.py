import json
from types import SimpleNamespace

from andersoncb_erp.services.dotnet_possible_values import get_authoritative_possible_values


def test_get_authoritative_possible_values_normalizes_runtime_payload(monkeypatch):
    payload = {
        "SMS.Broker.DataContracts.Documents.CustomsEntry.EntryTypeValues": [
            {"Value": "01", "Description": "Consumption"},
            {"Value": "03", "Text": "AD/CVD"},
        ],
        "SMS.Broker.DataContracts.Documents.CustomsEntry.TransportationModeValues": [
            {"Code": "11", "Name": "Vessel, Containerized"},
        ],
    }

    monkeypatch.setattr(
        "andersoncb_erp.services.dotnet_possible_values._locate_sms_broker_assembly_dir",
        lambda: SimpleNamespace(__str__=lambda self: "/tmp/fake"),
    )
    monkeypatch.setattr(
        "andersoncb_erp.services.dotnet_possible_values._ensure_extractor_exe",
        lambda assembly_dir: "/tmp/fake/PossibleValueExtractor.exe",
    )

    def fake_run(command, check, capture_output, text, env):
        return SimpleNamespace(returncode=0, stdout=json.dumps(payload), stderr="")

    monkeypatch.setattr("andersoncb_erp.services.dotnet_possible_values.subprocess.run", fake_run)

    values = get_authoritative_possible_values(
        {
            "customs_entry.entry_type": "SMS.Broker.DataContracts.Documents.CustomsEntry.EntryTypeValues",
            "customs_entry.transport_mode": "SMS.Broker.DataContracts.Documents.CustomsEntry.TransportationModeValues",
        }
    )

    assert values["customs_entry.entry_type"] == [
        {
            "code": "01",
            "label": "Consumption",
            "description": "Consumption",
            "raw_name": None,
            "raw_text": None,
        },
        {
            "code": "03",
            "label": "AD/CVD",
            "description": None,
            "raw_name": None,
            "raw_text": "AD/CVD",
        },
    ]
    assert values["customs_entry.transport_mode"] == [
        {
            "code": "11",
            "label": "Vessel, Containerized",
            "description": None,
            "raw_name": "Vessel, Containerized",
            "raw_text": None,
        }
    ]
