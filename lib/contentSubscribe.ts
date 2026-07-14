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
    heroBadge: "Value Upgrades",

    heroTitle: "Unlock More With",

    heroTitleGradient: "PDFNest Pro Ecosystem",

    heroSubtitle:
        "Everything you need to edit, convert, organize and secure PDFs. Start free and upgrade only when you need more.",

    premiumSectionTitle: "Premium Features Built For Production Workflows",

    studioTitle: "Virtual Document Studio",

    studioDescription:
        "Manage complex PDF workflows from a single workspace.",

    studioBulletPoints:
        "Edit pages,Watermarks,Metadata,Security controls,Multi-step workflows",

    canvasTitle: "Interactive Canvas",

    canvasDescription:
        "Create professional PDFs visually with drag-and-drop editing.",

    canvasBulletPoints:
        "Drag and drop,Custom layouts,Multiple images,Professional exports",

    speedTitle: "Faster Processing",

    speedDescription:
        "Priority infrastructure built for power users.",

    speedBulletPoints:
        "Priority queues,Larger limits,Faster operations,Premium tools",

    freeTitle: "Free",

    freePrice: "0",

    freeSubtitle: "Perfect for getting started",

    freeBulletPoints:
        "Core PDF tools,Basic OCR,Secure processing,5 operations/day",

    plusTitle: "Plus",

    plusMonthlyPrice: "4.99",

    plusYearlyPrice: "49.99",

    plusSubtitle:
        "Everything you need for frequent PDF work.",

    plusBulletPoints:
        "Everything in Free,50 operations/day,Full OCR,Priority processing,Larger file support",

    proTitle: "Pro",

    proMonthlyPrice: "9.99",

    proYearlyPrice: "99.99",

    proSubtitle:
        "Designed for professionals and heavy workloads.",

    proBulletPoints:
        "Everything in Plus,500 operations/day,Virtual Studio Workspace,Interactive Canvas,Premium Workspace features",

    trialText: "7-day free trial",

    securityTitle: "Your files stay completely private",

    securitySubtitle:
        "Files are processed securely and automatically removed after processing.",

    securityTags:
        "Temporary processing,Secure transfers,Automatic cleanup,No permanent storage",

    ctaGuestTitle:
        "Create a free account and start using PDFNest today.",

    ctaFreeTitle:
        "Need more power?",

    ctaFreeSubtitle:
        "Choose monthly or yearly billing and start with a 7-day free trial.",

    ctaPlusTitle:
        "Need even higher limits?",

    ctaPlusSubtitle:
        "Upgrade to Pro for Studio, Interactive Canvas, and maximum limits.",

    ctaProTitle:
        "You're on our most powerful plan.",

    ctaProSubtitle:
        "Manage your subscription anytime from your account settings.",

    faqsJson: `[
        {
            "q":"Is PDFNest free?",
            "a":"Yes. The Free plan includes essential PDF tools with a daily usage allowance."
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
            "q":"Can I cancel after subscribing?",
            "a":"Yes. You can cancel anytime. Your subscription remains active until the end of the current billing period, after which your account automatically returns to the Free plan."
        },
        {
            "q":"Are my files stored?",
            "a":"No. Files are processed temporarily and automatically deleted after processing."
        }
    ]`,
};