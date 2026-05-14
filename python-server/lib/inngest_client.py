import os
import inngest

client = inngest.Inngest(
    app_id="video-rag",
    api_key=os.environ["INNGEST_EVENT_KEY"],
    signing_key=os.environ["INNGEST_SIGNING_KEY"],
    is_production=os.environ.get("RAILWAY_ENVIRONMENT") == "production",
)
