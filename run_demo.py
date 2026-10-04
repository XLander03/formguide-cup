import json
from datetime import datetime, timezone
from pathlib import Path

from app.pipeline import FormSession
from app.schema import FormSchema

BANNER = (
    "FormGuide — savings AOF + KYC draft assistant (demo)\n"
    "Type your details in natural language (typed input stands in for the voice\n"
    "transcript for now). This never submits anything to a real bank.\n"
    "Type 'quit' to exit.\n"
)


def main() -> None:
    schema = FormSchema()
    session = FormSession(schema=schema)

    print(BANNER)
    print(session.next_prompt())

    while not session.is_done():
        try:
            user_input = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting without saving.")
            return
        if user_input.lower() in {"quit", "exit"}:
            print("Exiting without saving.")
            return

        if session.phase == "confirming":
            print(session.handle_confirmation(user_input))
        else:
            session.ingest(user_input)
            print(session.next_prompt())

    out_dir = Path("outputs")
    out_dir.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = out_dir / f"draft_{ts}.json"
    out_path.write_text(json.dumps(session.draft_output(), indent=2))
    print(f"\nSaved draft to {out_path} (draft only — not submitted to any bank).")


if __name__ == "__main__":
    main()
