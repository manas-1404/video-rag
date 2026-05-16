"""
Inngest function: mark-ready
Trigger: asr/complete
Waits for: visual/complete (same videoId)
Effect: sets videos.status = READY
"""

import datetime
import inngest
from lib import db
from lib.inngest_client import client


@client.create_function(
    fn_id="mark-ready",
    trigger=inngest.TriggerEvent(event="asr/complete"),
)
async def mark_ready(ctx: inngest.Context) -> None:
    video_id: str = ctx.event.data["videoId"]

    await ctx.step.wait_for_event(
        "wait-for-visual-complete",
        event="visual/complete",
        timeout=datetime.timedelta(hours=2),
        if_exp=f'event.data.videoId == "{video_id}"',
    )

    await ctx.step.run(
        "set-status-ready",
        lambda: db.update_video_status(video_id, "READY"),
    )
