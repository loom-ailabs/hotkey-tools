import { handleStripeWebhook } from "@/server/billing";
import { jsonError, jsonSuccess } from "@/server/http";

export async function POST(request: Request) {
  try {
    return jsonSuccess(await handleStripeWebhook(request));
  } catch (error) {
    return jsonError(error);
  }
}
