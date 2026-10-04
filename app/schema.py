import json
import re
from pathlib import Path

from .questions import QUESTION_TEXT

SCHEMA_PATH = (
    Path(__file__).resolve().parent.parent
    / "docs" / "schema" / "aof_kyc_demo_v1.compact.json"
)


class FormSchema:
    def __init__(self, path: Path = SCHEMA_PATH):
        with open(path) as f:
            self.raw = json.load(f)
        self.fields = {f["id"]: f for f in self.raw["fields"]}
        self.hints = self.raw["incomplete_routing"]["hints"]
        self.fallback_priority = self.raw["incomplete_routing"]["choice_next_ask"]["fallback_priority"]

    def is_required(self, field_id: str, values: dict) -> bool:
        field = self.fields[field_id]
        if field["required"]:
            return True
        cond = field.get("required_if")
        if not cond:
            return False
        return all(values.get(k) == v for k, v in cond.items())

    def core_field_ids(self) -> list[str]:
        """All fields except confirm_gates — those are only asked after readback."""
        return [fid for fid, f in self.fields.items() if f["group"] != "confirm_gates"]

    def confirm_gate_ids(self) -> list[str]:
        return [fid for fid, f in self.fields.items() if f["group"] == "confirm_gates"]

    def missing_required(self, values: dict, candidate_ids: list[str]) -> list[str]:
        return [
            fid for fid in candidate_ids
            if self.is_required(fid, values) and values.get(fid) in (None, "")
        ]

    def demo_default(self, field_id: str):
        """Value the demo assumes without asking (e.g. residential_status is
        fixed to resident_individual for this scope)."""
        return self.fields[field_id].get("validation", {}).get("demo_fixed")

    def ask_for(self, field_id: str, values: dict) -> str:
        for hint in self.hints:
            when_missing = hint.get("when_missing")
            if when_missing and field_id in when_missing:
                cond = hint.get("if")
                if cond and not all(values.get(k) == v for k, v in cond.items()):
                    continue
                return hint["ask_en"]
        if field_id in QUESTION_TEXT:
            return QUESTION_TEXT[field_id]
        label = self.fields[field_id]["label_en"].rstrip("?")
        return f"{label}?"

    def next_question(self, values: dict, candidate_ids: list[str]) -> str | None:
        missing = self.missing_required(values, candidate_ids)
        if not missing:
            return None
        ordered = [fid for fid in self.fallback_priority if fid in missing]
        ordered += [fid for fid in missing if fid not in ordered]
        return self.ask_for(ordered[0], values)

    def validate(self, field_id: str, value) -> bool:
        """Hard format checks stay in code — never trust the LLM for these."""
        field = self.fields[field_id]
        validation = field.get("validation", {})
        pattern = validation.get("pattern")
        if pattern and isinstance(value, str):
            candidate = value.upper() if validation.get("case") == "upper" else value
            if not re.fullmatch(pattern, candidate):
                return False
        return True
