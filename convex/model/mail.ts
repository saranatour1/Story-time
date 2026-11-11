import { v } from "convex/values";
import { components } from "../_generated/api";
import { env, internalAction } from "../_generated/server";
import { MAIL_OWNER } from "../lib/emailAddress";

// Addresses never go to the log or stay in the outcome.
const withoutAddresses = (text: string) => text.replace(/[^\s<>"']+@[^\s<>"']+/g, "[address]");

// Sends one queued message (lib/emailAddress.ts, `queueMail`) through the
// Cloudflare email component. Sent or refused, its address and words are
// cleared straight after: only the outcome stays. "Sent" means Cloudflare
// took it; the log line says what Cloudflare did with each address.
export const deliver = internalAction({
  args: { emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, { emailId }) => {
    const mail = components.cloudflareEmail.lib;
    const row = await ctx.runQuery(mail.get, { emailId });
    // An empty payload has been handled already, so a second run sends nothing.
    if (row === null || row.owner !== MAIL_OWNER || row.payload === "") return null;
    const { CF_ACCOUNT_ID, CF_EMAIL_TOKEN, EMAIL_FROM } = env;
    const result =
      CF_ACCOUNT_ID && CF_EMAIL_TOKEN && EMAIL_FROM
        ? await ctx.runAction(mail.send, {
            accountId: CF_ACCOUNT_ID,
            apiToken: CF_EMAIL_TOKEN,
            email: { from: EMAIL_FROM, ...JSON.parse(row.payload) },
          })
        : { error: "Cloudflare Email is not configured" };
    const error = result.error === undefined ? undefined : withoutAddresses(result.error);
    await ctx.runMutation(mail.reseal, { emailId, from: row.payload, payload: "" });
    await ctx.runMutation(mail.markResult, {
      emailId,
      failed: error !== undefined,
      error,
      messageId: result.messageId,
    });
    if (error !== undefined) console.error(`[mail] not sent: ${error}`);
    else {
      const n = (list?: string[]) => list?.length ?? 0;
      console.log(
        `[mail] accepted: ${n(result.delivered)} delivered, ${n(result.queued)} still trying, ` +
          `${n(result.permanentBounces)} bounced, ${n(result.suppressed)} suppressed`,
      );
    }
    return null;
  },
});
