import {getMailDomain} from "@/lib/api";

const MAIL_DOMAIN = getMailDomain();

export const EMAILS = {
    support: `support@${MAIL_DOMAIN}`,
    contact: `contact@${MAIL_DOMAIN}`,
    feedback: `feedback@${MAIL_DOMAIN}`,
} as const;