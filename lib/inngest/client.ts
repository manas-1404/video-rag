import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "video-rag",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
