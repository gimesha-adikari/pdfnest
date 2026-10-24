/** A configured client ID opts development into OAuth; terms consent is still required. */
export function isGoogleOAuthConfigured(clientId: string | undefined): boolean {
    return Boolean(clientId?.trim());
}
