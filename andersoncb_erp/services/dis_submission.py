from __future__ import annotations

import base64
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import frappe
from frappe import _
from frappe.utils import now_datetime

from andersoncb_erp.integrations.lds import find_text
from andersoncb_erp.services.dis_serializer import build_dis_envelope_xml, build_dis_package_xml, extract_message_id
from andersoncb_erp.services.sync import get_client


def process_dis_document_submission(doc) -> None:
    rows = [row for row in (doc.get("documents") or []) if int(getattr(row, "upload_to_dis", 0) or 0)]
    if not rows:
        return

    prepared_documents = []
    queued_at = now_datetime()
    try:
        for row in rows:
            prepared_documents.append(_prepare_document_payload(doc, row))

        client = get_client()
        template_dis_xml = client.new_dis_xml()
        root = ET.fromstring(template_dis_xml)
        dis_id = find_text(root, "Id")
        dis_number = find_text(root, "Number")
        if not dis_id or not dis_number:
            raise frappe.ValidationError(_("DIS upload failed: LDS did not return a DIS id/number."))

        envelope_b64 = find_text(root, "Envelope")
        if not envelope_b64:
            raise frappe.ValidationError(_("DIS upload failed: LDS did not return a DIS envelope template."))
        envelope_xml = base64.b64decode(envelope_b64).decode("utf-8")
        message_id = extract_message_id(envelope_xml)
        if not message_id:
            raise frappe.ValidationError(_("DIS upload failed: LDS did not return a message id for the DIS package."))

        for prepared in prepared_documents:
            prepared["document_id"] = client.get_new_dis_document_id(message_id)

        built_envelope_xml = build_dis_envelope_xml(
            envelope_xml,
            entry_context=_build_entry_context(doc),
            documents=prepared_documents,
        )
        final_xml = build_dis_package_xml(
            template_dis_xml,
            built_envelope_xml,
            entry_context=_build_entry_context(doc),
            documents=prepared_documents,
            dis_overrides={
                "client_ref": getattr(doc, "client_ref", None) or getattr(doc, "entry_number", None) or doc.name,
                "comment": f"Customs Entry {getattr(doc, 'entry_number', None) or doc.name}",
                "references": getattr(doc, "entry_number", None) or doc.name,
                "message_type": "DIS",
            },
        )
        final_saved_xml = client.save_dis_xml(final_xml)
        final_root = ET.fromstring(final_saved_xml)
        final_dis_id = find_text(final_root, "Id") or dis_id

        for row, prepared in zip(rows, prepared_documents):
            row.dis_document_id = prepared["document_id"]
            row.dis_uploaded_on = queued_at
            row.dis_status = "Saved in DIS"
            row.dis_error = None
    except Exception as exc:
        message = _("DIS upload failed: {0}").format(str(exc))
        for row in rows:
            row.dis_status = "Failed"
            row.dis_error = message
        raise frappe.ValidationError(message)


def _build_entry_context(doc) -> dict[str, Any]:
    shipment = (doc.get("shipments") or [None])[0]
    carrier_code = None
    if shipment and getattr(shipment, "carrier_profile", None):
        carrier = frappe.get_cached_doc("Carrier", shipment.carrier_profile)
        carrier_code = getattr(carrier, "carrier_code", None)
    return {
        "entry_number": getattr(doc, "entry_number", None),
        "filer_code": getattr(doc, "filer_code", None),
        "broker_reference": getattr(doc, "broker_reference", None),
        "port_of_entry": getattr(doc, "port_of_entry", None),
        "house_bill": getattr(doc, "house_bill", None),
        "master_bill": getattr(doc, "master_bill", None),
        "carrier_code": carrier_code,
    }


def _prepare_document_payload(doc, row) -> dict[str, str]:
    file_url = (getattr(row, "file_url", None) or "").strip()
    if not file_url:
        raise frappe.ValidationError(_("Each DIS document row needs a file attached before submit."))

    file_doc = _get_file_doc(file_url)
    content = file_doc.get_content()
    if isinstance(content, str):
        content = content.encode("utf-8")
    file_name = getattr(file_doc, "file_name", None) or Path(file_url).name or f"document-{row.idx}"
    description = (getattr(row, "description", None) or "").strip() or Path(file_name).stem
    extension = Path(file_name).suffix.lstrip(".")
    if not extension:
        raise frappe.ValidationError(_("Document {0} needs a file extension before it can be uploaded to DIS.").format(file_name))

    return {
        "file_name": file_name,
        "description": description,
        "extension": extension,
        "content_base64": base64.b64encode(content).decode("ascii"),
    }


def _get_file_doc(file_url: str):
    name = frappe.db.get_value("File", {"file_url": file_url}, "name")
    if not name:
        raise frappe.ValidationError(_("Attached file {0} could not be found in ERPNext.").format(file_url))
    return frappe.get_doc("File", name)
