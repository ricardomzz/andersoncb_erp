from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from xml.etree import ElementTree as ET

import requests

SOAP_ENV_NS = "http://schemas.xmlsoap.org/soap/envelope/"
WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
TEMPURI_NS = "http://tempuri.org/"

DEFAULT_INCLUDE = (
    "Importer,PortOfEntry,PortOfUnlading,StatementDailyEntries,Shipments,Shipments.Invoices,"
    "Shipments.Invoices.Articles,Shipments.Invoices.Articles.Tariffs,"
    "Shipments.Invoices.Articles.Tariffs.HarmonizedTariff,Shipments.Loads,"
    "Shipments.BookingLoads,Shipments.Charges,Shipments.PurchaseOrders"
)


class LDSClientError(Exception):
    pass


@dataclass
class LDSValidationErrorDetail:
    error_code: str | None
    error_message: str
    property_name: str | None
    value_as_string: str | None


class LDSValidationError(LDSClientError):
    def __init__(self, message: str, details: list[LDSValidationErrorDetail] | None = None):
        super().__init__(message)
        self.details = details or []


@dataclass
class LDSEntrySummary:
    entry_number: str
    filer_code: str | None
    entity_id: str | None
    raw_xml: str


@dataclass
class LDSListPage:
    entries: list[LDSEntrySummary]
    has_more: bool


class LDSClient:
    def __init__(self, endpoint_url: str, username: str, password: str, filer_code: str | None = None, timeout: int = 30):
        self.endpoint_url = endpoint_url.rstrip('/')
        self.username = username
        self.password = password
        self.filer_code = filer_code
        self.timeout = timeout

    @classmethod
    def from_settings(cls, settings):
        return cls(
            endpoint_url=settings.endpoint_url,
            username=settings.username,
            password=settings.get_password('password'),
            filer_code=getattr(settings, 'default_filer_code', None),
        )

    def iter_entry_summaries(self, page_size: int, rolling_window_days: int | None = None):
        position = 0
        while True:
            page = self.fetch_entry_summaries_page(position=position, page_size=page_size, rolling_window_days=rolling_window_days)
            for entry in page.entries:
                yield entry
            if not page.has_more:
                break
            position += page_size

    def fetch_entry_summaries_page(self, position: int, page_size: int, rolling_window_days: int | None = None) -> LDSListPage:
        criteria = build_rolling_window_criteria(rolling_window_days) if rolling_window_days else '[Id] < 999999999999L'
        body = self._build_get_page_body(criteria=criteria, position=position, page_size=page_size)
        body_element = self._request_xml('http://tempuri.org/IEntityManagerOf_CustomsEntry/GetPage', body)
        entry_elements = extract_entry_elements(body_element)
        entries = [summary_from_entry_element(element) for element in entry_elements]
        entries = [entry for entry in entries if entry.entry_number]
        return LDSListPage(entries=entries, has_more=len(entries) >= page_size)

    def fetch_entry_detail_xml(self, entry_number: str, filer_code: str | None = None) -> str:
        filer_code = filer_code or self.filer_code
        if not filer_code:
            raise LDSClientError('A filer code is required for GetByEntryNumber.')
        body = (
            f'<GetByEntryNumber xmlns="{TEMPURI_NS}">'
            f'<filerCode>{xml_escape(filer_code)}</filerCode>'
            f'<entryNumber>{xml_escape(entry_number)}</entryNumber>'
            '</GetByEntryNumber>'
        )
        body_element = self._request_xml('http://tempuri.org/ICustomsEntryManager/GetByEntryNumber', body)
        entry_elements = extract_entry_elements(body_element)
        if not entry_elements:
            raise LDSClientError('CustomsEntryManager/GetByEntryNumber did not return an entry payload.')
        return ET.tostring(entry_elements[0], encoding='unicode')

    def fetch_entry_detail_xml_by_id(self, entity_id: str | int) -> str:
        body = (
            f'<Get xmlns="{TEMPURI_NS}">'
            f'<Id>{xml_escape(entity_id)}</Id>'
            f'<include>{xml_escape(DEFAULT_INCLUDE)}</include>'
            '<option i:nil="true" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"/>'
            '</Get>'
        )
        body_element = self._request_xml('http://tempuri.org/IEntityManagerOf_CustomsEntry/Get', body)
        entry_elements = extract_entry_elements(body_element)
        if not entry_elements:
            raise LDSClientError('CustomsEntryManager/Get did not return an entry payload.')
        return ET.tostring(entry_elements[0], encoding='unicode')

    def save_entry_xml(self, entity_xml: str) -> str:
        body = f'<Save xmlns="{TEMPURI_NS}">{entity_xml}</Save>'
        body_element = self._request_xml('http://tempuri.org/IEntityManagerOf_CustomsEntry/Save', body)
        entry_elements = extract_entry_elements(body_element)
        if not entry_elements:
            return ET.tostring(body_element, encoding='unicode')
        return ET.tostring(entry_elements[0], encoding='unicode')

    def _build_get_page_body(self, criteria: str, position: int, page_size: int) -> str:
        return (
            f'<GetPage xmlns="{TEMPURI_NS}">'
            f'<pageQuery xmlns:i="{XSI_NS}">'
            f'<Criteria xmlns="">{xml_escape(criteria)}</Criteria>'
            f'<Include xmlns="">{xml_escape(DEFAULT_INCLUDE)}</Include>'
            '<Navigation xmlns="">Refresh</Navigation>'
            '<Option i:nil="true" xmlns=""/>'
            '<Order xmlns=""/>'
            f'<PageSize xmlns="">{page_size}</PageSize>'
            '<Parameters xmlns=""/>'
            f'<Position xmlns="">{position}</Position>'
            '<QueryTotalCount xmlns="">true</QueryTotalCount>'
            '<RequestFullList xmlns="">false</RequestFullList>'
            '</pageQuery></GetPage>'
        )

    def _request_xml(self, soap_action: str, body: str) -> ET.Element:
        response = requests.post(
            self._manager_url('CustomsEntryManager'),
            data=self._envelope(body),
            headers={
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': soap_action,
            },
            timeout=self.timeout,
        )
        return parse_soap_response(response.status_code, response.text)

    def _envelope(self, body: str) -> str:
        return (
            f'<soap:Envelope xmlns:soap="{SOAP_ENV_NS}">'
            '<soap:Header>'
            f'<o:Security soap:mustUnderstand="1" xmlns:o="{WSSE_NS}">'
            '<o:UsernameToken>'
            f'<o:Username>{xml_escape(self.username)}</o:Username>'
            '<o:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">'
            f'{xml_escape(self.password)}</o:Password>'
            '</o:UsernameToken></o:Security></soap:Header>'
            f'<soap:Body>{body}</soap:Body></soap:Envelope>'
        )

    def _manager_url(self, manager_name: str) -> str:
        if self.endpoint_url.endswith('/' + manager_name):
            return self.endpoint_url
        return f"{self.endpoint_url}/{manager_name}"


def build_rolling_window_criteria(rolling_window_days: int) -> str:
    return f'[Date] >= DateTime.Today.AddDays(-{int(rolling_window_days)})'


def xml_escape(value: Any) -> str:
    text = '' if value is None else str(value)
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&apos;')
    )


def parse_soap_body(xml_text: str) -> ET.Element:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise LDSClientError('LDS SOAP response was not valid XML.') from exc
    body = root.find(f'{{{SOAP_ENV_NS}}}Body')
    if body is None or not list(body):
        raise LDSClientError('LDS SOAP response did not contain a SOAP body payload.')
    return list(body)[0]


def parse_soap_response(status_code: int, xml_text: str) -> ET.Element:
    body_payload = parse_soap_body(xml_text)
    if localname(body_payload.tag) == 'Fault':
        fault_code = find_text(body_payload, 'faultcode') or find_text(body_payload, 'FaultCode')
        fault_message = find_text(body_payload, 'faultstring') or find_text(body_payload, 'Reason') or f'LDS SOAP request failed with status {status_code}.'
        if fault_code == 's:ENTRY_VALIDATION_ERROR':
            raise LDSValidationError(fault_message, extract_validation_error_details(body_payload))
        raise LDSClientError(fault_message)
    if status_code >= 400:
        raise LDSClientError(f'LDS SOAP request failed with status {status_code}.')
    return body_payload


def extract_validation_error_details(fault_element: ET.Element) -> list[LDSValidationErrorDetail]:
    details: list[LDSValidationErrorDetail] = []
    for detail in fault_element.iter():
        if localname(detail.tag) != 'EntryValidationErrorDetail':
            continue
        details.append(
            LDSValidationErrorDetail(
                error_code=find_text(detail, 'ErrorCode'),
                error_message=find_text(detail, 'ErrorMessage') or 'Unknown LDS validation error.',
                property_name=find_text(detail, 'Property'),
                value_as_string=find_text(detail, 'ValueAsString'),
            )
        )
    return details


def extract_entry_elements(root: ET.Element) -> list[ET.Element]:
    entries = []
    for element in root.iter():
        if localname(element.tag) in {'CustomsEntry', 'GetResult', 'GetByEntryNumberResult'} and has_descendant_text(element, 'EntryNumber'):
            entries.append(element)
    return dedupe_entry_elements(entries)


def summary_from_entry_element(element: ET.Element) -> LDSEntrySummary:
    return LDSEntrySummary(
        entry_number=find_text(element, 'EntryNumber'),
        filer_code=find_text(element, 'FilerCode') or find_text(element, 'EntryFilerCode'),
        entity_id=find_text(element, 'Id'),
        raw_xml=ET.tostring(element, encoding='unicode'),
    )


def dedupe_entry_elements(elements: list[ET.Element]) -> list[ET.Element]:
    seen = set()
    result = []
    for element in elements:
        key = (find_text(element, 'EntryNumber'), find_text(element, 'Id'))
        if not key[0] or key in seen:
            continue
        seen.add(key)
        result.append(element)
    return result


def has_descendant_text(element: ET.Element, tag_name: str) -> bool:
    return bool(find_text(element, tag_name))


def find_text(element: ET.Element, tag_name: str) -> str | None:
    for child in element.iter():
        if localname(child.tag) == tag_name:
            text = (child.text or '').strip()
            if text:
                return text
    return None


def localname(tag: str) -> str:
    return tag.split('}', 1)[-1]
