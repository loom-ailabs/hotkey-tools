import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All user-specific routes are dynamic. This app does not require an R2 ISR cache.
export default defineCloudflareConfig();
