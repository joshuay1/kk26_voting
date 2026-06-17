"""
Apply receipt anonymization mappings from the local internal workbook.

The workbook is intentionally expected under internal/, which is gitignored.
It contains two mappings:
- committee/member acronyms in columns A:B
- project ids, original project names, and anonymized project names in D:F
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "internal" / "KK Quittung anonymisiert.xlsx"

PUBLIC_CSVS = [
    *sorted((ROOT / "kk26_voting" / "csv").glob("KK26_*.csv")),
]
DATA_JSON = ROOT / "site" / "assets" / "data" / "kk26.json"
ASSEMBLE_SCRIPT = ROOT / "src" / "assemble_site_data.py"
ACRONYM_ALIASES = {
    # Generated receipt explanations sometimes used this old acronym as a
    # title-cased direct address.
    "ANA": ["Ana"],
}
PROJECT_ALIASES = {
    # This descriptive title fragment appeared in generated English/German
    # rationales, while the public pseudonym is only "Sense Lab".
    "84": [
        "Sense Lab & VERHANDELBAR (working title)",
        "Sense Lab & VERHANDELBAR (Arbeitstitel)",
        "Sense Lab & VERHANDELBAR (Arbeitst…)",
        "Sense Lab & VERHANDELBAR",
    ],
    "110": [
        "Von Winti-Nova bis zur Lokstadt (working title) – The transformation of the Sulzer site city center from 1986 to 2026",
        "Von Winti-Nova bis zur Lokstadt (working title) - The transformation of the Sulzer site city center from 1986 to 2026",
        "Von Winti-Nova bis zur Lokstadt",
        "Kurzfilm Winti-Arbeiterinnen (working title) – Die Verwandlung des Sulzer-Areals Stadt-Mitte von 1986 bis 2026",
        "Kurzfilm Winti-Arbeiterinnen (working title) - Die Verwandlung des Sulzer-Areals Stadt-Mitte von 1986 bis 2026",
    ],
    "129": [
        '"Szenischer Vortrag" - Staged Presentation (working title)',
        "Szenischer Vortrag - Staged Presentation (working title)",
    ],
}
TEXT_FILES = [
    *sorted((ROOT / "site").glob("*.html")),
    *sorted((ROOT / "site" / "assets" / "js").glob("*.js")),
    *sorted((ROOT / "kk26_voting" / "reports").glob("*.md")),
    *sorted((ROOT / "kk26_voting" / "reports").glob("*.html")),
]
AUDIT_ROOTS = [
    ROOT / "site",
    ROOT / "kk26_voting" / "csv",
]
AUDIT_SUFFIXES = {".html", ".js", ".json", ".css", ".md", ".txt", ".csv"}

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value = cell.find("a:v", NS)
    inline = cell.find("a:is", NS)
    if cell_type == "s" and value is not None:
        return shared_strings[int(value.text or "0")]
    if cell_type == "inlineStr" and inline is not None:
        return "".join(
            text.text or ""
            for text in inline.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
        )
    if value is not None:
        return value.text or ""
    return ""


def load_workbook_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("a:si", NS):
                shared_strings.append(
                    "".join(
                        text.text or ""
                        for text in item.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                    )
                )

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relmap = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels.findall("pr:Relationship", NS)
        }
        first_sheet = workbook.find("a:sheets", NS).find("a:sheet", NS)
        rel_id = first_sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = relmap[rel_id]
        if not target.startswith("xl/"):
            target = f"xl/{target}"

        root = ET.fromstring(archive.read(target))
        rows: list[dict[str, str]] = []
        for row in root.findall(".//a:sheetData/a:row", NS):
            values: dict[str, str] = {}
            for cell in row.findall("a:c", NS):
                column = "".join(ch for ch in cell.attrib.get("r", "") if ch.isalpha())
                values[column] = cell_text(cell, shared_strings).strip()
            if values:
                rows.append(values)
        return rows


def key_for_project_id(value: Any) -> str | None:
    text = str(value).strip()
    match = re.search(r"(\d+)(?:\.0)?$", text)
    if not match:
        return None
    return str(int(match.group(1)))


def build_maps(rows: list[dict[str, str]]) -> tuple[dict[str, str], dict[str, str], dict[str, list[str]]]:
    acronym_map: dict[str, str] = {}
    project_map: dict[str, str] = {}
    project_variants: dict[str, list[str]] = {}

    for row in rows[1:]:
        old_acronym = row.get("A", "").strip()
        new_acronym = row.get("B", "").strip()
        if old_acronym and new_acronym:
            acronym_map[old_acronym] = new_acronym

        project_key = key_for_project_id(row.get("D", ""))
        source_title = row.get("E", "").strip()
        anon_title = row.get("F", "").strip()
        if project_key and anon_title:
            project_map[project_key] = anon_title
            if source_title:
                project_variants.setdefault(project_key, []).append(source_title)

    return acronym_map, project_map, project_variants


def asciiish_variants(text: str) -> set[str]:
    replacements = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "Ä": "Ae",
        "Ö": "Oe",
        "Ü": "Ue",
        "é": "e",
        "è": "e",
        "à": "a",
        "É": "E",
        "È": "E",
        "À": "A",
    }
    converted = text
    for source, replacement in replacements.items():
        converted = converted.replace(source, replacement)
    variants = {converted}
    variants.add(converted.replace("’", "'").replace("–", "-").replace("—", "-"))
    variants.add(converted.replace("'", "’").replace("-", "–"))
    return {variant for variant in variants if variant and variant != text}


def add_title_variant(project_variants: dict[str, list[str]], project_id: Any, title: Any) -> None:
    key = key_for_project_id(project_id)
    if not key or not isinstance(title, str) or not title.strip():
        return
    project_variants.setdefault(key, []).append(title.strip())


def collect_csv_title_variants(project_variants: dict[str, list[str]]) -> None:
    for path in PUBLIC_CSVS:
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or "Project_ID" not in reader.fieldnames or "Title" not in reader.fieldnames:
                continue
            for row in reader:
                add_title_variant(project_variants, row.get("Project_ID"), row.get("Title"))


def collect_json_title_variants(project_variants: dict[str, list[str]]) -> None:
    if not DATA_JSON.exists():
        return
    data = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    for receipt in data.get("voter_receipts", []):
        for item in receipt.get("items", []):
            add_title_variant(project_variants, item.get("project_id"), item.get("title"))
    for project in data.get("project_receipts", []):
        add_title_variant(project_variants, project.get("project_id"), project.get("title"))


def replacement_rules(
    acronym_map: dict[str, str],
    project_map: dict[str, str],
    project_variants: dict[str, list[str]],
) -> tuple[list[tuple[re.Pattern[str], str]], list[tuple[str, str]]]:
    acronym_sources: list[tuple[str, str]] = []
    for source, replacement in acronym_map.items():
        acronym_sources.append((f"{source}s", f"{replacement}s"))
        acronym_sources.append((source, replacement))
        acronym_sources.extend(
            (alias, replacement)
            for alias in ACRONYM_ALIASES.get(source, [])
        )
    acronym_rules = [
        (
            re.compile(rf"(?<![A-Za-z0-9_]){re.escape(source)}(?![A-Za-z0-9_])"),
            replacement,
        )
        for source, replacement in sorted(acronym_sources, key=lambda item: len(item[0]), reverse=True)
    ]

    project_rules: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for project_key, replacement in project_map.items():
        variants = [
            *project_variants.get(project_key, []),
            *PROJECT_ALIASES.get(project_key, []),
        ]
        expanded: list[str] = []
        for variant in variants:
            expanded.append(variant)
            expanded.extend(asciiish_variants(variant))
            expanded.append(variant.strip('"').strip("'"))
        for variant in sorted(set(expanded), key=len, reverse=True):
            if not variant or variant == replacement:
                continue
            pair = (variant, replacement)
            if pair not in seen:
                seen.add(pair)
                project_rules.append(pair)

    project_rules.sort(key=lambda item: len(item[0]), reverse=True)
    return acronym_rules, project_rules


def replace_text(text: str, acronym_rules: list[tuple[re.Pattern[str], str]], project_rules: list[tuple[str, str]]) -> str:
    for source, replacement in project_rules:
        text = text.replace(source, replacement)
    for pattern, replacement in acronym_rules:
        text = pattern.sub(replacement, text)
    return text


def public_text_files() -> list[Path]:
    files: list[Path] = []
    for root in AUDIT_ROOTS:
        if not root.exists():
            continue
        files.extend(
            path
            for path in root.rglob("*")
            if path.is_file() and path.suffix.lower() in AUDIT_SUFFIXES
        )
    return sorted(files)


def audit_public_outputs(
    acronym_map: dict[str, str],
    project_variants: dict[str, list[str]],
) -> list[str]:
    issues: list[str] = []
    texts = [
        (path, path.read_text(encoding="utf-8", errors="replace"))
        for path in public_text_files()
    ]

    for source, aliases in project_variants.items():
        variants = [
            *aliases,
            *PROJECT_ALIASES.get(source, []),
        ]
        expanded: list[str] = []
        for variant in variants:
            expanded.append(variant)
            expanded.extend(asciiish_variants(variant))
        for variant in sorted(set(expanded), key=len, reverse=True):
            if not variant:
                continue
            for path, text in texts:
                if variant in text:
                    issues.append(f"old project label {variant!r} in {path.relative_to(ROOT)}")

    acronym_variants: list[str] = []
    for source in acronym_map:
        acronym_variants.extend([source, f"{source}s"])
        acronym_variants.extend(ACRONYM_ALIASES.get(source, []))
    for variant in sorted(set(acronym_variants), key=len, reverse=True):
        pattern = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(variant)}(?![A-Za-z0-9_])")
        for path, text in texts:
            if pattern.search(text):
                issues.append(f"old voter label {variant!r} in {path.relative_to(ROOT)}")

    return issues


def anonymize_csvs(
    acronym_map: dict[str, str],
    project_map: dict[str, str],
    acronym_rules: list[tuple[re.Pattern[str], str]],
    project_rules: list[tuple[str, str]],
) -> None:
    for path in PUBLIC_CSVS:
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
            fieldnames = reader.fieldnames
        if not fieldnames:
            continue

        for row in rows:
            project_key = key_for_project_id(row.get("Project_ID", ""))
            for key, value in list(row.items()):
                if not isinstance(value, str):
                    continue
                row[key] = replace_text(value, acronym_rules, project_rules)
            if "Voter_ID" in row and row["Voter_ID"] in acronym_map:
                row["Voter_ID"] = acronym_map[row["Voter_ID"]]
            if "Title" in row and project_key in project_map:
                row["Title"] = project_map[project_key]

        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)


def anonymize_json_value(
    value: Any,
    acronym_map: dict[str, str],
    project_map: dict[str, str],
    acronym_rules: list[tuple[re.Pattern[str], str]],
    project_rules: list[tuple[str, str]],
) -> Any:
    if isinstance(value, dict):
        project_key = key_for_project_id(value.get("project_id", value.get("Project_ID", "")))
        result = {
            key: anonymize_json_value(item, acronym_map, project_map, acronym_rules, project_rules)
            for key, item in value.items()
        }
        if "voter_id" in result and result["voter_id"] in acronym_map:
            result["voter_id"] = acronym_map[result["voter_id"]]
        if "Voter_ID" in result and result["Voter_ID"] in acronym_map:
            result["Voter_ID"] = acronym_map[result["Voter_ID"]]
        if project_key in project_map:
            if "title" in result:
                result["title"] = project_map[project_key]
            if "Title" in result:
                result["Title"] = project_map[project_key]
        return result
    if isinstance(value, list):
        return [anonymize_json_value(item, acronym_map, project_map, acronym_rules, project_rules) for item in value]
    if isinstance(value, str):
        return replace_text(value, acronym_rules, project_rules)
    return value


def anonymize_data_json(
    acronym_map: dict[str, str],
    project_map: dict[str, str],
    acronym_rules: list[tuple[re.Pattern[str], str]],
    project_rules: list[tuple[str, str]],
) -> None:
    if not DATA_JSON.exists():
        return
    data = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    anonymized = anonymize_json_value(data, acronym_map, project_map, acronym_rules, project_rules)
    DATA_JSON.write_text(json.dumps(anonymized, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def anonymize_text_files(
    acronym_rules: list[tuple[re.Pattern[str], str]],
    project_rules: list[tuple[str, str]],
) -> None:
    seen: set[Path] = set()
    for path in TEXT_FILES:
        if path in seen or not path.exists():
            continue
        seen.add(path)
        text = path.read_text(encoding="utf-8")
        updated = replace_text(text, acronym_rules, project_rules)
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def rebuild_site_data() -> None:
    subprocess.run(["python3", str(ASSEMBLE_SCRIPT)], cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="only scan public outputs for old anonymization labels",
    )
    args = parser.parse_args()

    if not WORKBOOK.exists():
        raise SystemExit(f"Missing anonymization workbook: {WORKBOOK}")

    rows = load_workbook_rows(WORKBOOK)
    acronym_map, project_map, project_variants = build_maps(rows)
    audit_project_variants = {
        project_key: list(variants)
        for project_key, variants in project_variants.items()
    }
    collect_csv_title_variants(project_variants)
    collect_json_title_variants(project_variants)
    acronym_rules, project_rules = replacement_rules(acronym_map, project_map, project_variants)

    if args.check:
        issues = audit_public_outputs(acronym_map, audit_project_variants)
        if issues:
            raise SystemExit("Public anonymization audit failed:\n" + "\n".join(issues))
        print("Public anonymization audit passed.")
        return

    anonymize_csvs(acronym_map, project_map, acronym_rules, project_rules)
    anonymize_data_json(acronym_map, project_map, acronym_rules, project_rules)
    rebuild_site_data()
    anonymize_text_files(acronym_rules, project_rules)

    print(f"Applied {len(acronym_map)} acronym replacements and {len(project_map)} project replacements.")


if __name__ == "__main__":
    main()
