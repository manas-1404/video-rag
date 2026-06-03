import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: "/ph",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
});

posthog.register({ app: "meridian" });
