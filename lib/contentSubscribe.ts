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
    plusPrice: string;
    plusSubtitle: string;
    plusBulletPoints: string;
    proTitle: string;
    proPrice: string;
    proSubtitle: string;
    proBulletPoints: string;
    securityTitle: string;
    securitySubtitle: string;
    securityTags: string;
    ctaGuestTitle: string;
    ctaFreeTitle: string;
    ctaFreeSubtitle: string;
    ctaPlusTitle: string;
    ctaProTitle: string;
    ctaProSubtitle: string;
    faqsJson: string;
}

export const fallbackSubscribeContent: SubscribeContent = {
    heroBadge: "Value Upgrades",
    heroTitle: "Unlock More With",
    heroTitleGradient: "PDFNest Pro Ecosystem",
    heroSubtitle: "Everything you need to edit, convert, organize and secure PDFs. Start free. Upgrade when your workflow grows.",
    premiumSectionTitle: "Premium Features Built For Production Workflows",
    studioTitle: "Virtual Document Studio",
    studioDescription: "Manage PDF workflows from a single workspace.",
    studioBulletPoints: "Edit pages,Watermarks,Metadata,Security controls,Multi-step workflows",
    canvasTitle: "Interactive Canvas",
    canvasDescription: "Create PDFs visually.",
    canvasBulletPoints: "Drag and drop,Custom layouts,Multiple images,Professional exports",
    speedTitle: "Faster Processing",
    speedDescription: "Built for power users.",
    speedBulletPoints: "Priority queues,Larger limits,Faster operations,Premium tools",
    freeTitle: "Free",
    freePrice: "0",
    freeSubtitle: "Perfect for occasional use",
    freeBulletPoints: "Core PDF tools,Basic OCR,Secure processing,5 operations/day",
    plusTitle: "Plus",
    plusPrice: "9",
    plusSubtitle: "For active users",
    plusBulletPoints: "Everything in Free,50 operations/day,Full OCR,Priority processing,Larger file support",
    proTitle: "Pro",
    proPrice: "29",
    proSubtitle: "For professionals",
    proBulletPoints: "Everything in Plus,500 operations/day,Virtual Studio Workspace,Interactive visual canvas,Premium Workspace layers",
    securityTitle: "Your files stay completely private",
    securitySubtitle: "Document security is integrated right into the core architecture loops.",
    securityTags: "Temporary processing,Secure transfers,Automatic cleanup,No permanent storage",
    ctaGuestTitle: "Create a free account and start using PDFNest today.",
    ctaFreeTitle: "Need more power?",
    ctaFreeSubtitle: "Upgrade to Plus or Pro to expand daily thresholds.",
    ctaPlusTitle: "Ready for Studio and Interactive Canvas?",
    ctaProTitle: "You already have full access.",
    ctaProSubtitle: "Your account profile holds absolute execution clearances.",
    faqsJson: `[
        {"q": "Is PDFNest free?", "a": "Yes! Our Free Plan gives you access to core PDF utility tools with a baseline allocation of 5 operations per day entirely free."},
        {"q": "What does Plus include?", "a": "Plus scales your volume limits up to 50 operations per day, unlocks full high-quality OCR extraction, guarantees priority server processing slots, and handles much larger file structures."},
        {"q": "What does Pro include?", "a": "Pro is our ultimate tier. It includes 500 daily operations, complete access to our multi-step Virtual Document Studio workspace, and the visual layout Interactive Canvas."},
        {"q": "Can I cancel anytime?", "a": "Absolutely. You are never locked into long agreements. You can upgrade, downgrade, or cancel your active billing status inside your settings panel at any point."},
        {"q": "Are my files stored?", "a": "Never. Privacy is paramount. Files are processed within private, temporary runtime sandboxes and permanently wiped immediately after processing."}
    ]`,
};