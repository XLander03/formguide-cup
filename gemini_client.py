import os
import time

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors

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

# Raw connection failures (dropped connection, timeout) aren't APIErrors at
# all — the SDK's own retries already gave up by the time these surface, so
# we retry once on the same model, then fall through to the next one.
_TRANSIENT_EXCEPTIONS = (httpx.TransportError, httpx.HTTPError)


def generate_with_fallback(contents, models=None, retries_per_model=1, **kwargs):
    """Try each model in order, falling through to the next on
    rate-limit/unavailable/network errors. Raises the last error if all fail."""
    last_error = None
    for model in models or MODEL_PRIORITY:
        for attempt in range(retries_per_model + 1):
            try:
                response = client.models.generate_content(
                    model=model, contents=contents, **kwargs
                )
                return response, model
            except errors.APIError as e:
                last_error = e
                if getattr(e, "code", None) in _RETRYABLE_CODES:
                    break  # move to next model
                raise
            except _TRANSIENT_EXCEPTIONS as e:
                last_error = e
                if attempt < retries_per_model:
                    time.sleep(1)
                    continue
                break  # exhausted retries on this model, try next
    raise last_error
