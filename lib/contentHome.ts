export interface HomeContent {
    heroBadgeGuest: string;
    heroBadgeFree: string;
    heroBadgePlus: string;
    heroBadgePro: string;
    heroWelcomeBack: string;
    heroTitleGuest: string;
    heroTitlePlus: string;
    heroTitlePro: string;
    heroSubtitleGuest: string;
    heroSubtitleGuestBold: string;
    authBannerProAccess: string;
    authBannerFreeUsage: string;
    authBannerFreeAction: string;
    feature1Title: string;
    feature1Description: string;
    feature2Title: string;
    feature2Description: string;
    feature3Title: string;
    feature3Description: string;
    searchPlaceholder: string;
    searchScopeSuffix: string;
    searchEmptyTitle: string;
    searchEmptyDescription: string;
    popularToolTitle: string;
    popularToolDescription: string;
    popularToolAction: string;

    categoryOrganizeTitle: string;
    categoryOrganizeDesc: string;

    categoryEditingTitle: string;
    categoryEditingDesc: string;

    categoryConvertTitle: string;
    categoryConvertDesc: string;

    categoryCreateTitle: string;
    categoryCreateDesc: string;

    categorySecurityTitle: string;
    categorySecurityDesc: string;

    categoryOptimizeTitle: string;
    categoryOptimizeDesc: string;

    categoryStudioTitle: string;
    categoryStudioDesc: string;
}

export const fallbackHomeContent: HomeContent = {
    heroBadgeGuest: "Professional PDF Workspace",
    heroBadgeFree: "Free Plan Active",
    heroBadgePro: "Pro Workspace Active",
    heroBadgePlus: "Plus Workspace Active",
    heroWelcomeBack: "Welcome Back",
    heroTitleGuest: "PDF Workspace",
    heroTitlePlus: "Plus Workspace",
    heroTitlePro: "Pro Workspace",
    heroSubtitleGuest: "Edit, convert, secure, and organize PDFs online with advanced, cloud-native processing tools.",
    heroSubtitleGuestBold: "Start free. Upgrade anytime.",
    authBannerProAccess: "Capacity: High-allowance unit allocation for intensive processing",
    authBannerFreeUsage: "Usage: 20 daily units • 8 per 3-hour window • 80 per month",
    authBannerFreeAction: "Upgrade to Plus",
    feature1Title: "Free Tier Included",
    feature1Description: "Access core document utilities with daily processing units at zero upfront cost.",
    feature2Title: "High-Capacity Processing",
    feature2Description: "Higher unit allowances across 3-hour, daily, and monthly windows for demanding workloads.",
    feature3Title: "Isolated Sandbox",
    feature3Description: "Secure processing sandboxes compile your document jobs and clear data after completion.",
    searchPlaceholder: "Search tool modules (e.g., merge, watermark, encrypt)...",
    searchScopeSuffix: "tools matching search matrix scope",
    searchEmptyTitle: "No structural modules matched",
    searchEmptyDescription: "Try checking code spelling tags or clear filters.",
    popularToolTitle: "Merge PDF Documents Collectively",
    popularToolDescription: "Combine separate structural files into a clean compound container setup natively in seconds without data compression loss.",
    popularToolAction: "Open Tool Module",

    categoryOrganizeTitle: "Page Organization",
    categoryOrganizeDesc: "Merge, split, rotate, crop, and organize PDF pages effortlessly.",

    categoryEditingTitle: "Document Editing",
    categoryEditingDesc: "Edit content, add annotations, signatures, watermarks, and page elements.",

    categoryConvertTitle: "PDF Conversion",
    categoryConvertDesc: "Convert PDFs to and from documents, images, text, and other formats.",

    categoryCreateTitle: "PDF Creation",
    categoryCreateDesc: "Create PDFs from Office files, images, websites, code, and markdown.",

    categorySecurityTitle: "Document Security",
    categorySecurityDesc: "Protect, unlock, and permanently remove sensitive information from PDFs.",

    categoryOptimizeTitle: "Optimization & Repair",
    categoryOptimizeDesc: "Compress, repair, and optimize PDFs for sharing, storage, and printing.",

    categoryStudioTitle: "PDF Studio",
    categoryStudioDesc: "An advanced workspace for complete PDF editing and document management.",
};