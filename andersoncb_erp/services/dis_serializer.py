from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from xml.etree import ElementTree as ET

from andersoncb_erp.integrations.lds import find_text
from andersoncb_erp.services.dotnet_serializer import APP_ROOT, DotNetSerializerUnavailable, _locate_sms_broker_assembly_dir

SERIALIZER_SOURCE = APP_ROOT / "dotnet" / "DISPackageSerializer.cs"
SERIALIZER_BUILD_DIR = APP_ROOT / ".cache" / "dotnet"
SERIALIZER_EXE = SERIALIZER_BUILD_DIR / "DISPackageSerializer.exe"


def build_dis_draft_xml(*, client_ref: str | None, comment: str | None, references: str | None, message_type: str | None = "DIS") -> str:
    payload = {
        "mode": "draft",
        "dis": {
            "client_ref": client_ref,
            "comment": comment,
            "references": references,
            "message_type": message_type,
        },
    }
    return _run_serializer(payload)


def build_dis_package_xml(saved_dis_xml: str, envelope_xml: str, *, entry_context: dict, documents: list[dict], action_code: str = "ADD", dis_overrides: dict | None = None) -> str:
    root = ET.fromstring(saved_dis_xml)
    dis_payload = {
        "id": _int_value(find_text(root, "Id")),
        "number": _int_value(find_text(root, "Number")),
        "entity_guid": find_text(root, "EntityGuid"),
        "row_version_base64": find_text(root, "RowVersion"),
        "client_ref": find_text(root, "ClientRef"),
        "comment": find_text(root, "Comment"),
        "references": find_text(root, "References"),
        "message_type": find_text(root, "MessageType"),
    }
    if dis_overrides:
        dis_payload.update({k: v for k, v in dis_overrides.items() if v is not None})
    payload = {
        "mode": "package",
        "action_code": action_code,
        "dis": dis_payload,
        "entry": entry_context,
        "documents": documents,
    }
    return _run_serializer(payload, envelope_xml=envelope_xml)


def extract_message_id(envelope_xml: str) -> str | None:
    root = ET.fromstring(envelope_xml)
    return find_text(root, "MessageID")


def _int_value(value: str | None) -> int:
    try:
        return int((value or "").strip())
    except Exception:
        return 0


def _run_serializer(payload: dict, *, envelope_xml: str | None = None) -> str:
    assembly_dir = _locate_sms_broker_assembly_dir()
    exe_path = _ensure_serializer_exe(assembly_dir)
    with tempfile.TemporaryDirectory(prefix="lds-dis-", dir=SERIALIZER_BUILD_DIR) as tmpdir:
        input_path = Path(tmpdir) / "input.json"
        output_path = Path(tmpdir) / "output.xml"
        input_path.write_text(json.dumps(payload), encoding="utf-8")
        command = ["mono", str(exe_path), str(input_path), str(output_path)]
        if envelope_xml is not None:
            envelope_path = Path(tmpdir) / "envelope.xml"
            envelope_path.write_text(envelope_xml, encoding="utf-8")
            command.append(str(envelope_path))
        env = os.environ.copy()
        env["MONO_PATH"] = str(assembly_dir)
        result = subprocess.run(command, check=False, capture_output=True, text=True, env=env)
        if result.returncode != 0:
            raise DotNetSerializerUnavailable(
                f"Mono DIS serializer failed with exit code {result.returncode}: {(result.stderr or result.stdout).strip()}"
            )
        return output_path.read_text(encoding="utf-8")


def _ensure_serializer_exe(assembly_dir: Path) -> Path:
    mono = shutil.which("mono")
    mcs = shutil.which("mcs")
    if not mono or not mcs:
        raise DotNetSerializerUnavailable("Mono toolchain is not available on this server.")

    SERIALIZER_BUILD_DIR.mkdir(parents=True, exist_ok=True)
    if SERIALIZER_EXE.exists():
        return SERIALIZER_EXE

    command = [
        mcs,
        "-nologo",
        "-optimize+",
        "-r:System.Runtime.Serialization",
        "-r:/usr/lib/mono/4.5/Facades/netstandard.dll",
        f"-r:{assembly_dir / 'SMS.Broker.Standard.dll'}",
        f"-out:{SERIALIZER_EXE}",
        str(SERIALIZER_SOURCE),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise DotNetSerializerUnavailable(
            f"Failed to compile Mono DIS serializer helper: {(result.stderr or result.stdout).strip()}"
        )
    return SERIALIZER_EXE


DIS_NS = "http://cbp.dhs.gov/DIS"
ET.register_namespace("DIS", DIS_NS)


def build_dis_envelope_xml(template_envelope_xml: str, *, entry_context: dict, documents: list[dict], action_code: str = "ADD") -> str:
    root = ET.fromstring(template_envelope_xml)
    body = next((el for el in root if el.tag.endswith("MessageBody")), None)
    if body is None:
        raise DotNetSerializerUnavailable("DIS template envelope is missing MessageBody.")
    for child in list(body):
        body.remove(child)

    package = ET.SubElement(body, f"{{{DIS_NS}}}DocumentSubmissionPackage")
    _add_text(package, "SubmittedToPortCode", entry_context.get("port_of_entry"))
    _add_text(package, "ActionCode", action_code)

    trade = ET.SubElement(package, f"{{{DIS_NS}}}TradeTransaction")
    entry_node = ET.SubElement(trade, f"{{{DIS_NS}}}Entry")
    _add_text(entry_node, "EntryNumber", entry_context.get("entry_number"))
    _add_text(entry_node, "Filer", entry_context.get("filer_code"))
    _add_text(entry_node, "ReferenceNumber", entry_context.get("broker_reference"))
    if entry_context.get("master_bill") or entry_context.get("house_bill"):
        bill = ET.SubElement(trade, f"{{{DIS_NS}}}Bill")
        _add_text(bill, "SCAC", entry_context.get("carrier_code"))
        _add_text(bill, "BillNumber", entry_context.get("master_bill"))
        _add_text(bill, "HouseBillNumber", entry_context.get("house_bill"))
        _add_text(bill, "ReferenceNumber", entry_context.get("broker_reference"))

    for document in documents:
        doc_node = ET.SubElement(package, f"{{{DIS_NS}}}DocumentData")
        header = ET.SubElement(doc_node, f"{{{DIS_NS}}}DocumentHeader")
        _add_text(header, "DocumentID", document.get("document_id"))
        _add_text(header, "DocumentLabel", document.get("description"))
        _add_text(header, "CompleteFileName", document.get("file_name"))
        _add_text(header, "FileExtensionType", document.get("extension"))
        _add_text(header, "DocumentDescription", document.get("description"))
        _add_text(header, "DocumentSentDate", _utc_now_text())
        _add_text(header, "DocPreviouslySubmitted", "N")
        _add_text(doc_node, "Comment", document.get("description"))
        _add_text(doc_node, "DocumentObject", document.get("content_base64"))

    return '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(root, encoding="unicode")


def _add_text(parent: ET.Element, local_name: str, value: str | None) -> None:
    child = ET.SubElement(parent, f"{{{DIS_NS}}}{local_name}")
    if value is not None:
        child.text = str(value)


def _utc_now_text() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
