export interface SubscribeContent {
    heroBadge: string;
    heroTitle: string;
    heroTitleGradient: string;
    heroSubtitle: string;

    premiumSectionTitle: string;

    studioTitle: string;
    studioDescription: string;
    studioBulletPoints: string;

    canvasTitle: string;
    canvasDescription: string;
    canvasBulletPoints: string;

    speedTitle: string;
    speedDescription: string;
    speedBulletPoints: string;

    freeTitle: string;
    freePrice: string;
    freeSubtitle: string;
    freeBulletPoints: string;

    plusTitle: string;
    plusMonthlyPrice: string;
    plusYearlyPrice: string;
    plusSubtitle: string;
    plusBulletPoints: string;

    proTitle: string;
    proMonthlyPrice: string;
    proYearlyPrice: string;
    proSubtitle: string;
    proBulletPoints: string;

    trialText: string;

    securityTitle: string;
    securitySubtitle: string;
    securityTags: string;

    ctaGuestTitle: string;
    ctaFreeTitle: string;
    ctaFreeSubtitle: string;
    ctaPlusTitle: string;
    ctaPlusSubtitle: string;
    ctaProTitle: string;
    ctaProSubtitle: string;

    faqsJson: string;
}

export const fallbackSubscribeContent: SubscribeContent = {
    heroBadge: "Transparent Computing Tiers",

    heroTitle: "Choose the Right Capacity for",

    heroTitleGradient: "Your Document Workflows",

    heroSubtitle:
        "All tools, Studio, and privacy features are available on every plan. Upgrade for higher processing unit allowances and demanding workloads.",

    premiumSectionTitle: "Processing Capacity Built for Every Workload",

    studioTitle: "More Processing Capacity",

    studioDescription:
        "Handle more document-processing work with higher 3-hour burst and daily unit allowances.",

    studioBulletPoints:
        "Higher daily unit allowances,3-hour burst capacity,Seamless workflow continuity,Predictable usage resets",

    canvasTitle: "Built for Demanding Documents",

    canvasDescription:
        "Resource-intensive operations scale transparently with document complexity, page count, and images.",

    canvasBulletPoints:
        "Page-weighted unit cost scaling,Multi-page batch conversions,Intensive OCR text extraction,High-volume document compilation",

    speedTitle: "Room for Heavy Workloads",

    speedDescription:
        "Higher tiers provide substantially more processing capacity for regular and heavy multi-document jobs.",

    speedBulletPoints:
        "100 to 400 daily processing units,Extended page duplication limits,Optional credit top-ups,7-day free trial on Plus & Pro",

    freeTitle: "Free",

    freePrice: "0",

    freeSubtitle: "For everyday, occasional document tasks",

    freeBulletPoints:
        "Access to all 39+ PDF tools,Studio workspace access,20 processing units per day,8 units per 3-hour window,80 units per month allowance",

    plusTitle: "Plus",

    plusMonthlyPrice: "4.99",

    plusYearlyPrice: "49.99",

    plusSubtitle:
        "For active users and frequent document tasks",

    plusBulletPoints:
        "Everything in Free,100 processing units per day,50 units per 3-hour window,500 units per month allowance,Higher capacity for multi-page jobs",

    proTitle: "Pro",

    proMonthlyPrice: "9.99",

    proYearlyPrice: "99.99",

    proSubtitle:
        "For power users and demanding batch workloads",

    proBulletPoints:
        "Everything in Plus,400 processing units per day,150 units per 3-hour window,2000 units per month allowance,Maximum capacity for heavy OCR and conversion jobs,Extended page duplication limits",

    trialText: "7-day free trial",

    securityTitle: "Your files stay completely private",

    securitySubtitle:
        "Files are processed securely and automatically removed after processing.",

    securityTags:
        "Temporary processing,Secure transfers,Automatic cleanup,No permanent storage",

    ctaGuestTitle:
        "Create a free account and start using Platen PDF today.",

    ctaFreeTitle:
        "Need more power?",

    ctaFreeSubtitle:
        "Choose monthly or yearly billing and start with a 7-day free trial.",

    ctaPlusTitle:
        "Need even higher limits?",

    ctaPlusSubtitle:
        "Upgrade to Pro for 400 daily units and maximum processing capacity.",

    ctaProTitle:
        "You're on our most powerful plan.",

    ctaProSubtitle:
        "Manage your subscription anytime from your account settings.",

    faqsJson: `[
        {
            "q":"Is Platen PDF free?",
            "a":"Yes. The Free plan includes all 39+ PDF tools and the Studio workspace with 20 processing units per day."
        },
        {
            "q":"How do processing units work?",
            "a":"Each tool operation consumes units based on document size and complexity. Simple operations use 1–2 units, while complex OCR or conversions consume units proportionally to page count."
        },
        {
            "q":"Do Plus and Pro include a free trial?",
            "a":"Yes. Every new Plus or Pro subscription starts with a 7-day free trial."
        },
        {
            "q":"Can I choose monthly or yearly billing?",
            "a":"Yes. Both Plus and Pro are available with monthly and yearly subscriptions."
        },
        {
            "q":"Can I cancel during the trial?",
            "a":"Yes. You can cancel at any time during the trial and you won't be charged. You'll continue to have access until the trial ends."
        },
        {
            "q":"What happens if I cancel after subscribing?",
            "a":"Yes. You can cancel anytime. Your subscription remains active until the end of the current billing period, after which your account automatically returns to the Free plan."
        },
        {
            "q":"Are my files stored?",
            "a":"No. Files are processed temporarily in ephemeral sandboxes and automatically deleted after processing."
        }
    ]`,
};