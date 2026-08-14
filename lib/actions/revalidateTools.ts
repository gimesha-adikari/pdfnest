"use server";

import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";

/**
 * Server Action: invalidate the "tools" Next.js fetch cache.
 *
 * This is called from the admin CMS client component AFTER a confirmed
 * successful bulk tools save to the backend. It runs server-side only.
 *
 * Security: Server Actions are never publicly accessible as API routes.
 * The action checks for the presence of the auth_token cookie before
 * triggering revalidation, preventing unauthenticated cache busting.
 *
 * Note: we do not re-validate the JWT here (no JWT_SECRET in Next.js env)
 * — the backend already validated the token and returned 200 before this
 * action is called. The cookie presence check is a defense-in-depth guard.
 */
export async function revalidateToolsCache(): Promise<{ ok: boolean }> {
    const cookieStore = await cookies();
    const authToken = cookieStore.get("auth_token");

    if (!authToken?.value) {
        // No auth cookie — refuse to revalidate
        return { ok: false };
    }

    // Pass "max" as the profile (required by Next.js 16's updated signature).
    // This immediately invalidates all fetch() calls tagged with "tools".
    revalidateTag("tools", "max");
    return { ok: true };
}
