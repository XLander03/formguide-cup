import json

from google.genai import types

from gemini_client import generate_with_fallback


def extract_fields(transcript: str, field_defs: list[dict], current_values: dict) -> dict:
    prompt = f"""You are extracting Indian bank account-opening/KYC form fields from a user's
spoken utterance. Only extract what the user actually said — never invent values.

Field definitions (id, label, type):
{json.dumps(field_defs, indent=2)}

Already-known values (do not repeat these unless the user is correcting them):
{json.dumps(current_values, indent=2)}

User said:
\"\"\"{transcript}\"\"\"

Return a JSON object with only the fields the user just provided or corrected, keyed by
field id. Booleans as true/false. Enum fields as lowercase snake_case matching the intent.
"""
    response, _ = generate_with_fallback(
        prompt, config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    return json.loads(response.text)


def classify_confirmation(utterance: str) -> dict:
    prompt = f"""Classify this reply to a form read-back confirmation prompt.

Reply: \"\"\"{utterance}\"\"\"

Return JSON: {{"is_clear_yes": bool, "requests_live_submit": bool}}
- is_clear_yes: true only for an unambiguous affirmative (not hedged, not a question).
- requests_live_submit: true if the user is asking to actually send/submit this to a bank,
  as opposed to just confirming the draft is correct.
"""
    response, _ = generate_with_fallback(
        prompt, config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    return json.loads(response.text)
