from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess

from andersoncb_erp.services.dotnet_serializer import APP_ROOT, DotNetSerializerUnavailable, _locate_sms_broker_assembly_dir


EXTRACTOR_SOURCE = APP_ROOT / "dotnet" / "PossibleValueExtractor.cs"
EXTRACTOR_BUILD_DIR = APP_ROOT / ".cache" / "dotnet"
EXTRACTOR_EXE = EXTRACTOR_BUILD_DIR / "PossibleValueExtractor.exe"

DEFAULT_POSSIBLE_VALUE_TARGETS = {
    "customs_entry.entry_type": "SMS.Broker.DataContracts.Documents.CustomsEntry.EntryTypeValues",
    "customs_entry.transport_mode": "SMS.Broker.DataContracts.Documents.CustomsEntry.TransportationModeValues",
    "customs_entry.payment_type": "SMS.Broker.DataContracts.Documents.CustomsEntry.PaymentTypeValues",
    "customs_entry.bond_type": "SMS.Broker.DataContracts.Documents.CustomsEntry.BondTypeValues",
    "entry_shipment.mode": "SMS.Broker.DataContracts.Documents.Shipment.TransportationModeValues",
}


def get_authoritative_possible_values(targets: dict[str, str] | None = None) -> dict[str, list[dict[str, str | None]]]:
    assembly_dir = _locate_sms_broker_assembly_dir()
    exe_path = _ensure_extractor_exe(assembly_dir)
    targets = targets or DEFAULT_POSSIBLE_VALUE_TARGETS
    query = ";".join(targets.values())

    env = os.environ.copy()
    env["MONO_PATH"] = str(assembly_dir)
    result = subprocess.run(
        ["mono", str(exe_path), query],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        raise DotNetSerializerUnavailable(
            f"Mono possible-value extractor failed with exit code {result.returncode}: {(result.stderr or result.stdout).strip()}"
        )

    raw_payload = json.loads(result.stdout)
    return {
        fieldname: [_normalize_possible_value(item) for item in raw_payload.get(target, [])]
        for fieldname, target in targets.items()
    }


def _normalize_possible_value(item: dict[str, object]) -> dict[str, str | None]:
    code = _string_value(item.get("Value")) or _string_value(item.get("Code")) or _string_value(item.get("Id"))
    label = (
        _string_value(item.get("Text"))
        or _string_value(item.get("Name"))
        or _string_value(item.get("Description"))
        or code
    )
    return {
        "code": code,
        "label": label,
        "description": _string_value(item.get("Description")),
        "raw_name": _string_value(item.get("Name")),
        "raw_text": _string_value(item.get("Text")),
    }


def _string_value(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _ensure_extractor_exe(assembly_dir: Path) -> Path:
    mono = shutil.which("mono")
    mcs = shutil.which("mcs")
    if not mono or not mcs:
        raise DotNetSerializerUnavailable("Mono toolchain is not available on this server.")

    EXTRACTOR_BUILD_DIR.mkdir(parents=True, exist_ok=True)
    if EXTRACTOR_EXE.exists():
        return EXTRACTOR_EXE

    command = [
        mcs,
        "-nologo",
        "-optimize+",
        f"-r:{assembly_dir / 'SMS.Broker.Standard.dll'}",
        f"-out:{EXTRACTOR_EXE}",
        str(EXTRACTOR_SOURCE),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise DotNetSerializerUnavailable(
            f"Failed to compile Mono possible-value extractor: {(result.stderr or result.stdout).strip()}"
        )
    return EXTRACTOR_EXE
