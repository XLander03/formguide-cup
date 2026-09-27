from dotenv import load_dotenv
from google import genai
from google.genai import errors
import os

load_dotenv()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Ordered by preference — first is tried first, later ones are fallbacks.
# "-latest" aliases auto-point at whatever current model Google considers
# default, so this list stays valid as models get deprecated/renamed.
MODEL_PRIORITY = [
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
]

# 404: model retired/renamed out from under us. 429/503: rate-limited or
# temporarily unavailable. All three mean "try the next model in the list".
_RETRYABLE_CODES = {404, 429, 503}


def generate_with_fallback(contents, models=None, **kwargs):
    """Try each model in order, falling through to the next on
    rate-limit/unavailable errors. Raises the last error if all fail."""
    last_error = None
    for model in models or MODEL_PRIORITY:
        try:
            response = client.models.generate_content(
                model=model, contents=contents, **kwargs
            )
            return response, model
        except errors.APIError as e:
            if getattr(e, "code", None) in _RETRYABLE_CODES:
                last_error = e
                continue
            raise
    raise last_error
