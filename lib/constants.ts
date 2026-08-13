import {getMailDomain} from "@/lib/api";

const MAIL_DOMAIN = getMailDomain();

export const EMAILS = {
    support: `support@${MAIL_DOMAIN}`,
    contact: `contact@${MAIL_DOMAIN}`,
    feedback: `feedback@${MAIL_DOMAIN}`,
} as const;

export const LEGAL_OPERATOR = {
    legalName: process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME || "Platen PDF",
    tradingAs: "Platen PDF",
    country: "Sri Lanka",
    fullAddress: process.env.NEXT_PUBLIC_LEGAL_OPERATOR_ADDRESS || "Sri Lanka",
} as const;