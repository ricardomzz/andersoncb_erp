from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from email import policy
from email.parser import BytesParser
from typing import Any, Iterable, Sequence
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
class LDSDirectoryEntitySummary:
    entity_id: str | None
    raw_xml: str


@dataclass
class LDSListPage:
    entries: list[LDSEntrySummary]
    has_more: bool


@dataclass
class LDSDirectoryListPage:
    entities: list[LDSDirectoryEntitySummary]
    has_more: bool


@dataclass
class LDSDISInfoSummary:
    entity_id: str | None
    dis_number: str | None
    client_ref: str | None
    references: str | None
    document_name: str | None
    document_tracking_id: str | None
    document_description: str | None
    document_review_status: str | None
    source_link: str | None
    raw_xml: str


@dataclass
class LDSDISInfoPage:
    items: list[LDSDISInfoSummary]
    has_more: bool


@dataclass
class LDSSharePointFileInfoSummary:
    file_name: str | None
    document_type_code: str | None
    document_type_name: str | None
    source_link: str | None
    raw_xml: str


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
        body_element = self._request_manager_xml('CustomsEntryManager', 'http://tempuri.org/IEntityManagerOf_CustomsEntry/GetPage', body)
        entry_elements = extract_entry_elements(body_element)
        entries = [summary_from_entry_element(element) for element in entry_elements]
        entries = [entry for entry in entries if entry.entry_number]
        has_more = ((find_text(body_element, 'HasNext') or '').strip().lower() == 'true') or len(entries) >= page_size
        return LDSListPage(entries=entries, has_more=has_more)

    def iter_importer_contacts(self, page_size: int):
        yield from self._iter_directory_entities(
            manager_name='ContactManager',
            interface_name='IEntityManagerOf_Contact',
            entity_local_names=('Contact',),
            criteria='[RolesIsImporter] = true',
            page_size=page_size,
        )

    def iter_carriers(self, page_size: int):
        yield from self._iter_directory_entities(
            manager_name='CarrierManager',
            interface_name='IEntityManagerOf_Carrier',
            entity_local_names=('Carrier',),
            criteria='[Id] < 999999999999L',
            page_size=page_size,
        )

    def fetch_importer_contact_by_code_xml(self, code: str) -> str:
        return self._fetch_directory_entity_by_code_xml(
            manager_name='ContactManager',
            soap_action_interface_name='IEntityManagerDirectoryOf_Contact',
            entity_local_names=('Contact', 'GetByCodeResult'),
            code=code,
        )

    def fetch_carrier_by_code_xml(self, code: str) -> str:
        return self._fetch_directory_entity_by_code_xml(
            manager_name='CarrierManager',
            soap_action_interface_name='IEntityManagerDirectoryOf_Carrier',
            entity_local_names=('Carrier', 'GetByCodeResult'),
            code=code,
        )

    def fetch_customs_port_by_code_xml(self, code: str) -> str:
        return self._fetch_directory_entity_by_code_xml(
            manager_name='CustomsPortManager',
            soap_action_interface_name='IEntityManagerDirectoryOf_CustomsPort',
            entity_local_names=('CustomsPort', 'GetByCodeResult'),
            code=code,
        )

    def fetch_harmonized_tariff_by_code_xml(self, code: str) -> str:
        return self._fetch_directory_entity_by_code_xml(
            manager_name='HarmonizedTariffManager',
            soap_action_interface_name='IEntityManagerDirectoryOf_HarmonizedTariff',
            entity_local_names=('HarmonizedTariff', 'GetByCodeResult'),
            code=code,
        )

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
        body_element = self._request_manager_xml('CustomsEntryManager', 'http://tempuri.org/ICustomsEntryManager/GetByEntryNumber', body)
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
        body_element = self._request_manager_xml('CustomsEntryManager', 'http://tempuri.org/IEntityManagerOf_CustomsEntry/Get', body)
        entry_elements = extract_entry_elements(body_element)
        if not entry_elements:
            raise LDSClientError('CustomsEntryManager/Get did not return an entry payload.')
        return ET.tostring(entry_elements[0], encoding='unicode')

    def save_entry_xml(self, entity_xml: str) -> str:
        return self._save_entity_xml(
            manager_name='CustomsEntryManager',
            interface_name='IEntityManagerOf_CustomsEntry',
            entity_local_names=('CustomsEntry', 'GetResult', 'GetByEntryNumberResult'),
            entity_xml=entity_xml,
        )

    def new_entry_xml(self) -> str:
        body = (
            f'<New xmlns="{TEMPURI_NS}">'
            '<sourceId i:nil="true" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"/>'
            '</New>'
        )
        body_element = self._request_manager_xml(
            'CustomsEntryManager',
            'http://tempuri.org/IEntityManagerOf_CustomsEntry/New',
            body,
        )
        entities = extract_named_elements(body_element, ('NewResult', 'CustomsEntry'))
        if not entities:
            raise LDSClientError('CustomsEntryManager/New did not return an entry template payload.')
        return ET.tostring(entities[0], encoding='unicode')

    def new_shipment_xml(self) -> str:
        body = (
            f'<New xmlns="{TEMPURI_NS}">'
            '<sourceId i:nil="true" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"/>'
            '</New>'
        )
        body_element = self._request_manager_xml(
            'ShipmentManager',
            'http://tempuri.org/IEntityManagerOf_Shipment/New',
            body,
        )
        entities = extract_named_elements(body_element, ('NewResult', 'Shipment'))
        if not entities:
            raise LDSClientError('ShipmentManager/New did not return a shipment template payload.')
        return ET.tostring(entities[0], encoding='unicode')


    def calculate_entry_number_for_entry(self, number: str | int, filer_code: str, customs_entry_id: str | int, adjust_sequence: bool = True) -> str:
        body = (
            f'<CalculateEntryNumberForEntry xmlns="{TEMPURI_NS}">'
            f'<number>{xml_escape(number)}</number>'
            f'<filerCode>{xml_escape(filer_code)}</filerCode>'
            f'<customsEntryId>{xml_escape(customs_entry_id)}</customsEntryId>'
            f'<adjustSequence>{str(bool(adjust_sequence)).lower()}</adjustSequence>'
            '</CalculateEntryNumberForEntry>'
        )
        body_element = self._request_manager_xml(
            'CustomsEntryManager',
            'http://tempuri.org/ICustomsEntryManager/CalculateEntryNumberForEntry',
            body,
        )
        value = find_text(body_element, 'CalculateEntryNumberForEntryResult')
        if not value:
            raise LDSClientError('CustomsEntryManager/CalculateEntryNumberForEntry did not return an entry number.')
        return value

    def calculate_entry_number(self, number: str | int, filer_code: str, check_unique: bool = True, adjust_sequence: bool = False) -> str:
        body = (
            f'<CalculateEntryNumber xmlns="{TEMPURI_NS}">'
            f'<number>{xml_escape(number)}</number>'
            f'<filerCode>{xml_escape(filer_code)}</filerCode>'
            f'<checkUnique>{str(bool(check_unique)).lower()}</checkUnique>'
            f'<adjustSequence>{str(bool(adjust_sequence)).lower()}</adjustSequence>'
            '</CalculateEntryNumber>'
        )
        body_element = self._request_manager_xml(
            'CustomsEntryManager',
            'http://tempuri.org/ICustomsEntryManager/CalculateEntryNumber',
            body,
        )
        value = find_text(body_element, 'CalculateEntryNumberResult')
        if not value:
            raise LDSClientError('CustomsEntryManager/CalculateEntryNumber did not return an entry number.')
        return value

    def calculate_entry_number_for_entry(self, number: str | int, filer_code: str, customs_entry_id: str | int, adjust_sequence: bool = False) -> str:
        body = (
            f'<CalculateEntryNumberForEntry xmlns="{TEMPURI_NS}">'
            f'<number>{xml_escape(number)}</number>'
            f'<filerCode>{xml_escape(filer_code)}</filerCode>'
            f'<customsEntryId>{xml_escape(customs_entry_id)}</customsEntryId>'
            f'<adjustSequence>{str(bool(adjust_sequence)).lower()}</adjustSequence>'
            '</CalculateEntryNumberForEntry>'
        )
        body_element = self._request_manager_xml(
            'CustomsEntryManager',
            'http://tempuri.org/ICustomsEntryManager/CalculateEntryNumberForEntry',
            body,
        )
        value = find_text(body_element, 'CalculateEntryNumberForEntryResult')
        if not value:
            raise LDSClientError('CustomsEntryManager/CalculateEntryNumberForEntry did not return an entry number.')
        return value

    def fetch_entry_detail_xml_by_internal_number(self, number: str | int) -> str:
        body = (
            f'<GetByNumber xmlns="{TEMPURI_NS}">'
            f'<number>{xml_escape(number)}</number>'
            '</GetByNumber>'
        )
        body_element = self._request_manager_xml(
            'CustomsEntryManager',
            'http://tempuri.org/IEntityManagerDocumentOf_CustomsEntry/GetByNumber',
            body,
        )
        entry_elements = extract_named_elements(body_element, ('CustomsEntry', 'GetByNumberResult'), predicate=lambda e: has_descendant_text(e, 'EntryNumber'))
        if not entry_elements:
            raise LDSClientError('CustomsEntryManager/GetByNumber did not return an entry payload.')
        return ET.tostring(entry_elements[0], encoding='unicode')

    def set_customs_entry_ready_status(self, entity_id: str | int, ready: bool) -> None:
        body = (
            f'<SetDocumentReadyStatus xmlns="{TEMPURI_NS}">'
            f'<id>{xml_escape(entity_id)}</id>'
            f'<ready>{str(bool(ready)).lower()}</ready>'
            '</SetDocumentReadyStatus>'
        )
        self._request_manager_xml(
            'CustomsEntryManager',
            'http://tempuri.org/ICustomsEntryManager/SetDocumentReadyStatus',
            body,
        )

    def save_contact_xml(self, entity_xml: str) -> str:
        return self._save_entity_xml(
            manager_name='ContactManager',
            interface_name='IEntityManagerOf_Contact',
            entity_local_names=('Contact',),
            entity_xml=entity_xml,
        )

    def save_carrier_xml(self, entity_xml: str) -> str:
        return self._save_entity_xml(
            manager_name='CarrierManager',
            interface_name='IEntityManagerOf_Carrier',
            entity_local_names=('Carrier',),
            entity_xml=entity_xml,
        )

    def save_dis_xml(self, entity_xml: str) -> str:
        return self._save_entity_xml(
            manager_name='DISManager',
            interface_name='IEntityManagerOf_DIS',
            entity_local_names=('DIS',),
            entity_xml=entity_xml,
        )

    def fetch_dis_package_xml(self, entity_id: str | int, include: str = 'Documents') -> str:
        body = (
            f'<Get xmlns="{TEMPURI_NS}">'
            f'<Id>{xml_escape(entity_id)}</Id>'
            f'<include>{xml_escape(include or "")}</include>'
            '<option i:nil="true" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"/>'
            '</Get>'
        )
        body_element = self._request_manager_xml(
            'DISManager',
            'http://tempuri.org/IEntityManagerOf_DIS/Get',
            body,
        )
        entities = extract_named_elements(body_element, ('DIS', 'GetResult'))
        if not entities:
            raise LDSClientError('DISManager/Get did not return a DIS payload.')
        return ET.tostring(entities[0], encoding='unicode')

    def new_dis_xml(self) -> str:
        body = (
            f'<New xmlns="{TEMPURI_NS}">'
            '<sourceId i:nil="true" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"/>'
            '</New>'
        )
        body_element = self._request_manager_xml(
            'DISManager',
            'http://tempuri.org/IEntityManagerOf_DIS/New',
            body,
        )
        entities = extract_named_elements(body_element, ('NewResult', 'DIS'))
        if not entities:
            raise LDSClientError('DISManager/New did not return a DIS template payload.')
        return ET.tostring(entities[0], encoding='unicode')

    def create_dis_message_envelope_xml(self, number: str | int) -> str:
        body = (
            f'<CreateMessageEnvelope xmlns="{TEMPURI_NS}">'
            f'<number>{xml_escape(number)}</number>'
            '</CreateMessageEnvelope>'
        )
        body_element = self._request_manager_xml(
            'DISManager',
            'http://tempuri.org/IDISManager/CreateMessageEnvelope',
            body,
        )
        envelopes = extract_named_elements(body_element, ('MessageEnvelope', 'CreateMessageEnvelopeResult'))
        if not envelopes:
            raise LDSClientError('DISManager/CreateMessageEnvelope did not return a message envelope payload.')
        return ET.tostring(envelopes[0], encoding='unicode')

    def get_new_dis_document_id(self, message_id: str) -> str:
        body = (
            f'<GetNewDocumentID xmlns="{TEMPURI_NS}">'
            f'<messageId>{xml_escape(message_id)}</messageId>'
            '</GetNewDocumentID>'
        )
        body_element = self._request_manager_xml(
            'DISManager',
            'http://tempuri.org/IDISManager/GetNewDocumentID',
            body,
        )
        value = find_text(body_element, 'GetNewDocumentIDResult')
        if not value:
            raise LDSClientError('DISManager/GetNewDocumentID did not return a document id.')
        return value

    def put_dis_to_queue(self, entity_id: str | int) -> None:
        body = (
            f'<PutToQUE xmlns="{TEMPURI_NS}">'
            f'<Id>{xml_escape(entity_id)}</Id>'
            '</PutToQUE>'
        )
        self._request_manager_xml(
            'DISManager',
            'http://tempuri.org/IDISManager/PutToQUE',
            body,
        )

    def fetch_dis_info_page(self, criteria: str, page_size: int = 50, position: int = 0) -> LDSDISInfoPage:
        body = (
            f'<DISInfo xmlns="{TEMPURI_NS}">'
            f'{self._build_entity_page_query_xml(criteria=criteria, position=position, page_size=page_size, include="")}'
            '</DISInfo>'
        )
        body_element = self._request_manager_xml(
            'SmsLookupManager',
            'http://tempuri.org/ISmsLookupManager/DISInfo',
            body,
        )
        info_elements = extract_named_elements(body_element, ('DISInfo',))
        items = [dis_info_summary_from_element(element) for element in info_elements]
        has_more = ((find_text(body_element, 'HasNext') or '').strip().lower() == 'true') or len(items) >= page_size
        return LDSDISInfoPage(items=items, has_more=has_more)

    def fetch_entity_files_info(self, link: str) -> list[LDSSharePointFileInfoSummary]:
        body = (
            f'<GetEntityFilesInfo xmlns="{TEMPURI_NS}">'
            f'<link>{xml_escape(link)}</link>'
            '</GetEntityFilesInfo>'
        )
        body_element = self._request_sharepoint_xml(
            'http://tempuri.org/ISmsSharePointManager/GetEntityFilesInfo',
            body,
        )
        return [sharepoint_file_info_summary_from_element(element) for element in extract_named_elements(body_element, ('SharePointFileInfo',))]

    def fetch_sharepoint_entity_file(self, link: str, file_name: str) -> bytes:
        body = (
            f'<GetEntityFile xmlns="{TEMPURI_NS}">'
            f'<link>{xml_escape(link)}</link>'
            f'<fileName>{xml_escape(file_name)}</fileName>'
            '</GetEntityFile>'
        )
        response = self._request_sharepoint_response(
            'http://tempuri.org/ISmsSharePointManager/GetEntityFile',
            body,
        )
        return parse_soap_binary_response(
            response.status_code,
            response.headers.get('Content-Type', ''),
            response.content,
        )

    def fetch_entity_file(self, link: str, file_name: str) -> bytes:
        body = (
            f'<GetEntityFile xmlns="{TEMPURI_NS}">'
            f'<link>{xml_escape(link)}</link>'
            f'<fileName>{xml_escape(file_name)}</fileName>'
            '</GetEntityFile>'
        )
        response = self._request_manager_response(
            'SmsServiceManager',
            'http://tempuri.org/ISmsServiceManager/GetEntityFile',
            body,
        )
        return parse_soap_binary_response(
            response.status_code,
            response.headers.get('Content-Type', ''),
            response.content,
        )

    def _save_entity_xml(self, manager_name: str, interface_name: str, entity_local_names: Sequence[str], entity_xml: str) -> str:
        body = f'<Save xmlns="{TEMPURI_NS}">{entity_xml}</Save>'
        body_element = self._request_manager_xml(manager_name, f'http://tempuri.org/{interface_name}/Save', body)
        entities = extract_named_elements(body_element, entity_local_names)
        if not entities:
            return ET.tostring(body_element, encoding='unicode')
        return ET.tostring(entities[0], encoding='unicode')

    def _iter_directory_entities(self, manager_name: str, interface_name: str, entity_local_names: Sequence[str], criteria: str, page_size: int, include: str = '') -> Iterable[LDSDirectoryEntitySummary]:
        position = 0
        while True:
            page = self._fetch_directory_page(manager_name, interface_name, entity_local_names, criteria, page_size, position, include=include)
            for entity in page.entities:
                yield entity
            if not page.has_more:
                break
            position += page_size

    def _fetch_directory_entity_by_code_xml(self, manager_name: str, soap_action_interface_name: str, entity_local_names: Sequence[str], code: str, include: str = '') -> str:
        body = (
            f'<GetByCode xmlns="{TEMPURI_NS}">'
            f'<code>{xml_escape(code)}</code>'
            f'<include>{xml_escape(include or "")}</include>'
            '</GetByCode>'
        )
        body_element = self._request_manager_xml(manager_name, f'http://tempuri.org/{soap_action_interface_name}/GetByCode', body)
        entities = extract_named_elements(body_element, entity_local_names)
        if not entities:
            raise LDSClientError(f'{manager_name}/GetByCode did not return an entity payload.')
        return ET.tostring(entities[0], encoding='unicode')

    def _fetch_directory_page(
        self,
        manager_name: str,
        interface_name: str,
        entity_local_names: Sequence[str],
        criteria: str,
        page_size: int,
        position: int,
        include: str = '',
    ) -> LDSDirectoryListPage:
        body = self._build_get_page_body(criteria=criteria, position=position, page_size=page_size, include=include)
        body_element = self._request_manager_xml(manager_name, f'http://tempuri.org/{interface_name}/GetPage', body)
        entity_elements = extract_named_elements(body_element, entity_local_names)
        entities = [LDSDirectoryEntitySummary(entity_id=find_text(element, 'Id'), raw_xml=ET.tostring(element, encoding='unicode')) for element in entity_elements]
        has_more = ((find_text(body_element, 'HasNext') or '').strip().lower() == 'true') or len(entities) >= page_size
        return LDSDirectoryListPage(entities=entities, has_more=has_more)

    def _build_get_page_body(self, criteria: str, position: int, page_size: int, include: str = DEFAULT_INCLUDE) -> str:
        return f'<GetPage xmlns="{TEMPURI_NS}">{self._build_entity_page_query_xml(criteria=criteria, position=position, page_size=page_size, include=include)}</GetPage>'

    def _build_entity_page_query_xml(self, criteria: str, position: int, page_size: int, include: str = DEFAULT_INCLUDE) -> str:
        return (
            f'<query xmlns:i="{XSI_NS}">'
            f'<Criteria xmlns="">{xml_escape(criteria)}</Criteria>'
            f'<Include xmlns="">{xml_escape(include or "")}</Include>'
            '<Navigation xmlns="">Refresh</Navigation>'
            '<Option i:nil="true" xmlns=""/>'
            '<Order xmlns=""/>'
            f'<PageSize xmlns="">{page_size}</PageSize>'
            '<Parameters xmlns=""/>'
            f'<Position xmlns="">{position}</Position>'
            '<QueryTotalCount xmlns="">true</QueryTotalCount>'
            '<RequestFullList xmlns="">false</RequestFullList>'
            '</query>'
        )

    def _request_manager_xml(self, manager_name: str, soap_action: str, body: str) -> ET.Element:
        response = self._request_manager_response(manager_name, soap_action, body)
        return parse_soap_xml_response(
            response.status_code,
            response.headers.get('Content-Type', ''),
            response.content,
        )

    def _request_manager_response(self, manager_name: str, soap_action: str, body: str) -> requests.Response:
        return requests.post(
            self._manager_url(manager_name),
            data=self._envelope(body),
            headers={
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': soap_action,
            },
            timeout=self.timeout,
        )

    def _request_sharepoint_xml(self, soap_action: str, body: str) -> ET.Element:
        response = self._request_sharepoint_response(soap_action, body)
        return parse_soap_xml_response(
            response.status_code,
            response.headers.get('Content-Type', ''),
            response.content,
        )

    def _request_sharepoint_response(self, soap_action: str, body: str) -> requests.Response:
        return requests.post(
            self._manager_url('SmsSharePointManager'),
            data=self._envelope(body),
            headers={
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': soap_action,
            },
            timeout=self.timeout,
        )

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
    start_date = date.today() - timedelta(days=int(rolling_window_days))
    return f'[Date] >= #{start_date.isoformat()}#'


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
    stripped = xml_text.lstrip()
    if not stripped.startswith('<') or stripped.startswith('--'):
        envelope_start = xml_text.find('<s:Envelope')
        if envelope_start < 0:
            envelope_start = xml_text.find('<soap:Envelope')
        envelope_end = xml_text.rfind('</s:Envelope>')
        if envelope_end < 0:
            envelope_end = xml_text.rfind('</soap:Envelope>')
            if envelope_end >= 0:
                envelope_end += len('</soap:Envelope>')
        else:
            envelope_end += len('</s:Envelope>')
        if envelope_start >= 0 and envelope_end > envelope_start:
            xml_text = xml_text[envelope_start:envelope_end]
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


def parse_soap_xml_response(status_code: int, content_type: str, content: bytes) -> ET.Element:
    if is_multipart_related(content_type):
        root_xml, _attachments = _parse_multipart_related(content_type, content)
        return parse_soap_response(status_code, root_xml.decode('utf-8', errors='replace'))
    return parse_soap_response(status_code, content.decode('utf-8', errors='replace'))


def parse_soap_binary_response(status_code: int, content_type: str, content: bytes) -> bytes:
    if is_multipart_related(content_type):
        root_xml, attachments = _parse_multipart_related(content_type, content)
        body_payload = parse_soap_response(status_code, root_xml.decode('utf-8', errors='replace'))
        result_element = _find_binary_result_element(body_payload)
        href = _extract_xop_include_href(result_element)
        if href:
            return _find_attachment_payload(attachments, href)
        return _decode_base64_or_fail(result_element.text or '')
    body_payload = parse_soap_response(status_code, content.decode('utf-8', errors='replace'))
    result_element = _find_binary_result_element(body_payload)
    return _decode_base64_or_fail(result_element.text or '')


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
    return extract_named_elements(root, ('CustomsEntry', 'GetResult', 'GetByEntryNumberResult'), predicate=lambda e: has_descendant_text(e, 'EntryNumber'))


def extract_named_elements(root: ET.Element, local_names: Sequence[str], predicate=None) -> list[ET.Element]:
    names = set(local_names)
    elements: list[ET.Element] = []
    for element in root.iter():
        if localname(element.tag) not in names:
            continue
        if predicate and not predicate(element):
            continue
        elements.append(element)
    return dedupe_named_elements(elements)


def summary_from_entry_element(element: ET.Element) -> LDSEntrySummary:
    return LDSEntrySummary(
        entry_number=find_text(element, 'EntryNumber'),
        filer_code=find_text(element, 'FilerCode') or find_text(element, 'EntryFilerCode'),
        entity_id=find_text(element, 'Id'),
        raw_xml=ET.tostring(element, encoding='unicode'),
    )


def sharepoint_file_info_summary_from_element(element: ET.Element) -> LDSSharePointFileInfoSummary:
    return LDSSharePointFileInfoSummary(
        file_name=find_text(element, 'FileName') or find_text(element, 'Name'),
        document_type_code=find_text(element, 'DocumentTypeCode'),
        document_type_name=find_text(element, 'DocumentTypeName'),
        source_link=find_text(element, 'SourceLink'),
        raw_xml=ET.tostring(element, encoding='unicode'),
    )


def dis_info_summary_from_element(element: ET.Element) -> LDSDISInfoSummary:
    return LDSDISInfoSummary(
        entity_id=find_text(element, 'Id'),
        dis_number=find_text(element, 'DISNumber') or find_text(element, 'Number'),
        client_ref=find_text(element, 'ClientRef'),
        references=find_text(element, 'References'),
        document_name=find_text(element, 'DocumentName'),
        document_tracking_id=find_text(element, 'DocumentTrackingID'),
        document_description=find_text(element, 'DocumentDescription'),
        document_review_status=find_text(element, 'DocumentReviewStatus'),
        source_link=find_text(element, 'SourceLink'),
        raw_xml=ET.tostring(element, encoding='unicode'),
    )


def dedupe_named_elements(elements: list[ET.Element]) -> list[ET.Element]:
    seen = set()
    result = []
    for element in elements:
        key = (localname(element.tag), find_text(element, 'EntryNumber') or find_text(element, 'Id') or str(id(element)))
        if key in seen:
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


def is_multipart_related(content_type: str) -> bool:
    return (content_type or '').lower().startswith('multipart/related')


def _parse_multipart_related(content_type: str, content: bytes) -> tuple[bytes, dict[str, bytes]]:
    synthetic_message = f'Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n'.encode('utf-8') + content
    message = BytesParser(policy=policy.default).parsebytes(synthetic_message)
    if not message.is_multipart():
        raise LDSClientError('LDS multipart response did not contain multiple parts.')
    parts = list(message.iter_parts())
    if not parts:
        raise LDSClientError('LDS multipart response did not contain a SOAP root part.')
    root_xml = parts[0].get_payload(decode=True) or b''
    attachments: dict[str, bytes] = {}
    for part in parts[1:]:
        cid = (part.get('Content-ID') or '').strip().strip('<>')
        if cid:
            attachments[cid] = part.get_payload(decode=True) or b''
    return root_xml, attachments


def _find_binary_result_element(body_payload: ET.Element) -> ET.Element:
    for element in body_payload.iter():
        name = localname(element.tag)
        if not name.endswith('Result'):
            continue
        if _extract_xop_include_href(element):
            return element
        if (element.text or '').strip():
            return element
    raise LDSClientError('LDS SOAP binary response did not contain a result payload.')


def _extract_xop_include_href(element: ET.Element) -> str | None:
    for child in element.iter():
        if localname(child.tag) != 'Include':
            continue
        href = child.attrib.get('href')
        if href:
            return href
    return None


def _find_attachment_payload(attachments: dict[str, bytes], href: str) -> bytes:
    key = href.strip()
    if key.lower().startswith('cid:'):
        key = key[4:]
    key = key.strip('<>')
    payload = attachments.get(key)
    if payload is None:
        raise LDSClientError('LDS SOAP attachment payload was not found for the requested file.')
    return payload


def _decode_base64_or_fail(value: str) -> bytes:
    encoded = (value or '').strip()
    if not encoded:
        raise LDSClientError('LDS SOAP binary response was empty.')
    try:
        import base64
        return base64.b64decode(encoded)
    except Exception as exc:  # pragma: no cover
        raise LDSClientError('LDS SOAP binary response was not valid base64.') from exc
