import os
import inngest
from dotenv import load_dotenv

load_dotenv()

_missing = [v for v in ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] if not os.environ.get(v)]
if _missing:
    raise RuntimeError(f"Missing required environment variables: {', '.join(_missing)}")

client = inngest.Inngest(
    app_id="video-rag",
    event_key=os.environ["INNGEST_EVENT_KEY"],
    signing_key=os.environ["INNGEST_SIGNING_KEY"],
    is_production=os.environ.get("INNGEST_DEV", "0") != "1",
)
