import json
from google.genai import types
from gemini_client import generate_with_fallback

with open("docs/schema/aof_kyc_demo_v1.compact.json") as f:
    schema = json.load(f)

# A subset of the always-required fields for a short demo prompt.
FIELDS = [
    "journey_mode", "applicant_full_name", "dob", "residential_status",
    "pan_available", "pan_number", "mobile_registered",
    "addr_current_line1", "addr_current_city", "addr_current_state",
    "addr_current_pin", "ovd_poi_type", "ovd_poi_number",
    "existing_bank_customer", "pep_declaration", "tax_resident_india_only",
]
field_defs = [f for f in schema["fields"] if f["id"] in FIELDS]

# Simulates a Whisper transcript of someone speaking to open a savings account.
transcript = (
    "Hi, I want to open a new savings account. My name is Priya Sharma, "
    "born 12th March 1994, I'm a resident Indian. I have a PAN, it's "
    "ABCPS1234D. My mobile number is 9876543210. I live at 14 Lake View "
    "Apartments, Indiranagar, Bengaluru, Karnataka, PIN 560038. I'll use "
    "my driving licence as ID proof, number KA01 20190012345. I'm not "
    "already a customer here, I'm not a politically exposed person, and "
    "I only pay tax in India."
)

prompt = f"""Extract these fields from the transcript below into JSON.
Use null for any field not mentioned. Field definitions:
{json.dumps(field_defs, indent=2)}

Transcript:
\"\"\"{transcript}\"\"\"

Return only a JSON object keyed by field id.
"""

response, model_used = generate_with_fallback(
    prompt,
    config=types.GenerateContentConfig(response_mime_type="application/json"),
)

print(f"[model: {model_used}]\n")
print(json.dumps(json.loads(response.text), indent=2))
