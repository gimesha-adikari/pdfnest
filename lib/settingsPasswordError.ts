export function getPasswordUpdateErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message.trim() : "";

    if (/^incorrect current password$/i.test(message)) {
        return "Current password is incorrect.";
    }

    return message || "Failed to update password";
}
