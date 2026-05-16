import { inngest } from "./client";

export const dummy = inngest.createFunction(
  { id: "dummy" },
  { event: "dummy/ping" },
  async () => {
    return { ok: true };
  }
);
