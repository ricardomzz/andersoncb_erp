from __future__ import annotations

from pathlib import Path
import re
from typing import Any

DOC_PATH = Path('/opt/frappe-bench/apps/andersoncb_erp/docs/customs_entry_ui_test_cases.md')
PREP_PATH = Path('/opt/frappe-bench/apps/andersoncb_erp/docs/customs_entry_ui_execution_prep.md')
CASE_ID_RE = re.compile(r'^(\d{2}|G\d{2})$')


def load_test_case_catalog() -> list[dict[str, Any]]:
    text = DOC_PATH.read_text()
    cases: list[dict[str, Any]] = []
    for line in text.splitlines():
        if not line.startswith('| '):
            continue
        if line.startswith('| ID ') or line.startswith('| ---'):
            continue
        parts = [part.strip() for part in line.strip('|').split('|')]
        if len(parts) < 10:
            continue
        case_id = parts[0]
        if not CASE_ID_RE.fullmatch(case_id):
            continue
        cases.append({
            'case_id': case_id,
            'case_type': 'generic' if case_id.startswith('G') else 'core',
            'focus': parts[1],
            'entry_type': strip_ticks(parts[2]),
            'transport': strip_ticks(parts[3]),
            'pay_bond': strip_ticks(parts[4]),
            'structure': strip_ticks(parts[5]),
            'master_data': parts[6],
            'hts_pattern': strip_ticks(parts[7]),
            'port_pattern': strip_ticks(parts[8]),
            'notes': parts[9],
        })
    return cases


def get_test_case(case_id: str) -> dict[str, Any] | None:
    for case in load_test_case_catalog():
        if case['case_id'] == case_id:
            return case
    return None


def load_execution_prep_snapshot() -> dict[str, Any]:
    text = PREP_PATH.read_text()
    return {
        'endpoint_url': extract_bullet_value(text, 'Endpoint URL'),
        'username': extract_bullet_value(text, 'Username'),
        'default_filer_code': extract_bullet_value(text, 'Default filer code'),
        'symbolic_ports': parse_markdown_table(text, '## Current Test-Environment Port Candidates'),
        'symbolic_hts': parse_markdown_table(text, '## Current Test-Environment HTS Candidates'),
    }


def parse_markdown_table(text: str, heading: str) -> list[dict[str, str]]:
    lines = text.splitlines()
    try:
        start = lines.index(heading)
    except ValueError:
        return []
    rows: list[dict[str, str]] = []
    header = None
    for line in lines[start + 1:]:
        if line.startswith('## ') and line != heading:
            break
        if not line.startswith('| '):
            continue
        if line.startswith('| ---'):
            continue
        parts = [part.strip() for part in line.strip('|').split('|')]
        if header is None:
            header = parts
            continue
        if len(parts) != len(header):
            continue
        rows.append({normalize_header(key): strip_ticks(value) for key, value in zip(header, parts)})
    return rows


def extract_bullet_value(text: str, label: str) -> str | None:
    pattern = re.compile(rf'^- {re.escape(label)}: `(.*?)`$', re.MULTILINE)
    match = pattern.search(text)
    return match.group(1) if match else None


def strip_ticks(value: str) -> str:
    value = value.strip()
    if value.startswith('`') and value.endswith('`'):
        return value[1:-1]
    return value


def normalize_header(value: str) -> str:
    value = strip_ticks(value)
    value = value.lower()
    value = re.sub(r'[^a-z0-9]+', '_', value).strip('_')
    return value
