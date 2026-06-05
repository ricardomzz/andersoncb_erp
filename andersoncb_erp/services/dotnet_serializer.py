from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile


class DotNetSerializerUnavailable(RuntimeError):
    pass


APP_ROOT = Path(__file__).resolve().parents[1]
SERIALIZER_SOURCE = APP_ROOT / "dotnet" / "CustomsEntrySerializer.cs"
SERIALIZER_BUILD_DIR = APP_ROOT / ".cache" / "dotnet"
SERIALIZER_EXE = SERIALIZER_BUILD_DIR / "CustomsEntrySerializer.exe"


def build_customs_entry_repair_xml(
    source_xml: str,
    *,
    number: str | int,
    entry_number: str,
    broker_reference: str,
    bond_type: str = "9",
    consolidated_release_entries: str = "",
) -> str:
    assembly_dir = _locate_sms_broker_assembly_dir()
    exe_path = _ensure_serializer_exe()
    with tempfile.TemporaryDirectory(prefix="lds-dotnet-", dir=SERIALIZER_BUILD_DIR) as tmpdir:
        input_path = Path(tmpdir) / "input.xml"
        output_path = Path(tmpdir) / "output.xml"
        input_path.write_text(source_xml, encoding="utf-8")
        command = [
            "mono",
            str(exe_path),
            str(input_path),
            str(output_path),
            str(number),
            entry_number,
            broker_reference,
            bond_type,
            consolidated_release_entries,
        ]
        env = os.environ.copy()
        env['MONO_PATH'] = str(assembly_dir)
        result = subprocess.run(command, check=False, capture_output=True, text=True, env=env)
        if result.returncode != 0:
            raise DotNetSerializerUnavailable(
                f"Mono serializer failed with exit code {result.returncode}: {(result.stderr or result.stdout).strip()}"
            )
        return output_path.read_text(encoding="utf-8")


def _ensure_serializer_exe() -> Path:
    mono = shutil.which("mono")
    mcs = shutil.which("mcs")
    if not mono or not mcs:
        raise DotNetSerializerUnavailable("Mono toolchain is not available on this server.")

    assembly_dir = _locate_sms_broker_assembly_dir()
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
            f"Failed to compile Mono serializer helper: {(result.stderr or result.stdout).strip()}"
        )
    return SERIALIZER_EXE


def _locate_sms_broker_assembly_dir() -> Path:
    candidates = [APP_ROOT / 'vendor' / 'dotnet']
    configured = os.environ.get("LDS_SMS_BROKER_DLL_DIR")
    if configured:
        candidates.append(Path(configured))
    candidates.append(Path("/tmp/sms_msi"))

    for candidate in candidates:
        if (candidate / "SMS.Broker.Standard.dll").exists():
            return candidate

    raise DotNetSerializerUnavailable(
        "Could not locate SMS.Broker.Standard.dll. Put it in andersoncb_erp/vendor/dotnet or set LDS_SMS_BROKER_DLL_DIR."
    )
