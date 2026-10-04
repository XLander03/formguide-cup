from dataclasses import dataclass, field

from .llm import classify_confirmation, extract_fields
from .schema import FormSchema

DRAFT_DISCLAIMER = (
    "This creates a DRAFT ONLY — it will not be submitted to any bank. "
    "Fields and requirements vary by bank."
)


@dataclass
class FormSession:
    schema: FormSchema
    values: dict = field(default_factory=dict)
    phase: str = "collecting"  # collecting -> readback -> confirming -> done

    def __post_init__(self) -> None:
        for field_id in self.schema.core_field_ids():
            if field_id in self.values:
                continue
            default = self.schema.demo_default(field_id)
            if default is not None:
                self.values[field_id] = default

    def ingest(self, transcript: str) -> None:
        candidate_ids = self.schema.core_field_ids()
        field_defs = [self.schema.fields[fid] for fid in candidate_ids]
        updates = extract_fields(transcript, field_defs, self.values)
        for field_id, value in updates.items():
            if value is None or field_id not in self.schema.fields:
                continue
            if isinstance(value, str) and not self.schema.validate(field_id, value):
                continue  # fails hard format check — treat as not captured, will be re-asked
            self.values[field_id] = value

    def next_prompt(self) -> str:
        if self.phase == "collecting":
            question = self.schema.next_question(self.values, self.schema.core_field_ids())
            if question is not None:
                return question
            self.phase = "readback"
            return self.readback_text()
        if self.phase == "readback":
            return self.readback_text()
        if self.phase == "confirming":
            return "Please confirm: is the above correct? (yes/no)"
        return "Draft complete."

    def readback_text(self) -> str:
        v = self.values
        mobile = str(v.get("mobile_registered") or "")
        self.phase = "confirming"
        return (
            "Here's what I have — please confirm:\n"
            f"  Name: {v.get('applicant_full_name')}\n"
            f"  DOB: {v.get('dob')}\n"
            f"  Mobile: ...{mobile[-4:] if mobile else '(missing)'}\n"
            f"  ID proof: {v.get('ovd_poi_type')} ({v.get('ovd_poi_number')})\n"
            f"  Address: {v.get('addr_current_line1')}, {v.get('addr_current_city')}, "
            f"{v.get('addr_current_state')} {v.get('addr_current_pin')}\n"
            f"{DRAFT_DISCLAIMER}\n"
            "Do you confirm the above is correct? (yes/no)"
        )

    def handle_confirmation(self, utterance: str) -> str:
        result = classify_confirmation(utterance)
        if result.get("requests_live_submit"):
            return (
                "This tool only prepares a draft — it cannot submit anything to a bank live. "
                "Please confirm you understand this is draft-only. (yes/no)"
            )
        if result.get("is_clear_yes"):
            self.values["readback_confirmed"] = True
            self.values["draft_only_ack"] = True
            self.values["no_live_submit_ack"] = True
            self.phase = "done"
            return "Confirmed. Draft saved — not submitted to any bank."
        self.phase = "readback"
        return "Let's go through the details again.\n" + self.readback_text()

    def is_done(self) -> bool:
        return self.phase == "done"

    def draft_output(self) -> dict:
        return {
            "schema_id": "aof_kyc_demo_v1",
            "status": "draft_ready_no_bank_submit",
            "values": self.values,
        }
