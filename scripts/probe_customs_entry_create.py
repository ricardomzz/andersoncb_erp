from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from xml.etree import ElementTree as ET

import frappe

from andersoncb_erp.services.submission import (
    DOCUMENTS_NS,
    SERIALIZATION_NS,
    _build_new_shipment_template_root,
    _find_direct_child,
    _parse_new_entry_template_root,
    _reorder_children,
    _set_entry_arrival_fields,
    _set_entry_carrier,
    _set_importer_from_profile,
    _set_port_of_entry,
    _set_port_of_unlading,
    _set_shipments,
    _set_text,
    build_submission_entity_xml,
    ENTRY_FIELD_RANK,
)
from andersoncb_erp.services.sync import get_client


@dataclass
class Row:
    shipment_no: str | None = None
    mode: str | None = None
    arrival_date: str | None = None
    carrier_profile: str | None = None


@dataclass
class Doc:
    entry_number: str
    filer_code: str
    entry_type: str
    entry_date: str
    transport_mode: str
    broker_reference: str
    bond_number: str
    client_ref: str
    port_of_entry: str
    importer_profile: str
    shipments: list[Row]
    house_bill: str | None = None
    lds_id: str | None = None


def local(node: ET.Element) -> str:
    return node.tag.split("}", 1)[-1]


def child_text(node: ET.Element, name: str) -> str | None:
    child = _find_direct_child(node, name)
    return child.text if child is not None else None


def describe_root(root: ET.Element) -> dict[str, str | None]:
    keys = [
        "EntityGuid",
        "Id",
        "RowVersion",
        "Date",
        "Number",
        "EntryNumber",
        "EntryFilerCode",
        "Importer_Id",
        "Carrier_Id",
        "PortOfEntry_Id",
        "PortOfUnlading_Id",
        "TransportationMode",
        "EntryType",
        "ClientRef",
        "BrokerReferenceNumber",
    ]
    data = {key: child_text(root, key) for key in keys}
    data["children"] = [local(child) for child in list(root)]
    return data


def build_doc(args: argparse.Namespace) -> Doc:
    return Doc(
        entry_number=args.entry_number,
        filer_code=args.filer_code,
        entry_type=args.entry_type,
        entry_date=args.entry_date,
        transport_mode=args.transport_mode,
        broker_reference=args.broker_reference,
        bond_number=args.bond_number,
        client_ref=args.client_ref,
        port_of_entry=args.port_of_entry,
        importer_profile=args.importer_profile,
        shipments=[
            Row(
                shipment_no=args.shipment_no,
                mode=args.transport_mode,
                arrival_date=args.arrival_date,
                carrier_profile=args.carrier_profile,
            )
        ],
        house_bill=args.house_bill,
    )


def build_variant_xml(doc: Doc, variant: str) -> str:
    if variant == "current":
        return build_submission_entity_xml(doc)

    template_root = _parse_new_entry_template_root()
    entity = ET.Element("entity")
    for attr_name, value in template_root.attrib.items():
        if attr_name == "{http://www.w3.org/2001/XMLSchema-instance}type":
            continue
        entity.set(attr_name, value)
    for child in list(template_root):
        entity.append(child)

    _set_text(entity, "EntryNumber", doc.entry_number, DOCUMENTS_NS)
    _set_text(entity, "EntryFilerCode", doc.filer_code, DOCUMENTS_NS)
    _set_text(entity, "EntryType", doc.entry_type, DOCUMENTS_NS)
    _set_text(entity, "TransportationMode", doc.transport_mode, DOCUMENTS_NS)
    _set_text(entity, "BrokerReferenceNumber", doc.broker_reference, DOCUMENTS_NS)
    _set_text(entity, "SuretyCode", doc.bond_number, DOCUMENTS_NS)
    _set_text(entity, "ClientRef", doc.client_ref, DOCUMENTS_NS)
    _set_entry_arrival_fields(entity, doc.shipments)
    _set_port_of_entry(entity, doc.port_of_entry)
    _set_port_of_unlading(entity, doc.port_of_entry)
    _set_importer_from_profile(entity, doc.importer_profile)
    _set_entry_carrier(entity, doc.shipments)

    if variant == "with_shipments":
        _set_shipments(
            entity,
            doc.shipments,
            importer_profile_name=doc.importer_profile,
            house_bill=doc.house_bill,
        )
    else:
        shipments = _find_direct_child(entity, "Shipments")
        if shipments is not None:
            entity.remove(shipments)

    if variant == "number_equals_entry":
        _set_text(entity, "Number", doc.entry_number, None)
    elif variant == "number_blank":
        number = _find_direct_child(entity, "Number")
        if number is not None:
            number.text = ""
    elif variant == "id_blank_guid_template":
        _set_text(entity, "Id", "", None)
    elif variant == "id_zero_guid_template":
        _set_text(entity, "Id", "0", None)
    elif variant == "guid_blank":
        guid = _find_direct_child(entity, "EntityGuid")
        if guid is not None:
            guid.text = ""
    elif variant == "template_shipment":
        shipments = _find_direct_child(entity, "Shipments")
        if shipments is not None:
            entity.remove(shipments)
        shipments = ET.SubElement(entity, f"{{{DOCUMENTS_NS}}}Shipments")
        shipment = _build_new_shipment_template_root()
        shipments.append(shipment)
        _reorder_children(shipment, {})

    _reorder_children(entity, ENTRY_FIELD_RANK)
    return ET.tostring(entity, encoding="unicode")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True)
    parser.add_argument("--variant", default="current")
    parser.add_argument("--entry-number", default="30049998")
    parser.add_argument("--filer-code", default="SY1")
    parser.add_argument("--entry-type", default="01")
    parser.add_argument("--entry-date", default="2026-06-04")
    parser.add_argument("--arrival-date", default="2026-06-04")
    parser.add_argument("--transport-mode", default="21")
    parser.add_argument("--broker-reference", default="CODXPROBE")
    parser.add_argument("--bond-number", default="037")
    parser.add_argument("--client-ref", default="CODEX-PROBE")
    parser.add_argument("--port-of-entry", default="4601")
    parser.add_argument("--importer-profile", default="9m8j2qillm")
    parser.add_argument("--carrier-profile", default="9mi0ctc4kr")
    parser.add_argument("--shipment-no", default="1410")
    parser.add_argument("--house-bill", default="HB-CODEX-1")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    frappe.init(site=args.site)
    frappe.connect()
    try:
        doc = build_doc(args)
        template_root = _parse_new_entry_template_root()
        payload_xml = build_variant_xml(doc, args.variant)
        payload_root = ET.fromstring(payload_xml)
        result = {
            "variant": args.variant,
            "template": describe_root(template_root),
            "payload": describe_root(payload_root),
            "payload_xml": payload_xml,
        }
        if args.save:
            client = get_client()
            try:
                saved_xml = client.save_entry_xml(payload_xml)
                result["save_ok"] = True
                result["save_xml"] = saved_xml
            except Exception as exc:  # noqa: BLE001
                result["save_ok"] = False
                result["save_error"] = str(exc)
        print(json.dumps(result, indent=2))
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
