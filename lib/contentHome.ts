export interface HomeContent {
    heroBadgeGuest: string;
    heroBadgeFree: string;
    heroBadgePro: string;
    heroWelcomeBack: string;
    heroTitleGuest: string;
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
    heroWelcomeBack: "Welcome Back",
    heroTitleGuest: "PDF Workspace",
    heroTitlePro: "Pro Workspace",
    heroSubtitleGuest: "Edit, convert, secure, and organize PDFs online with advanced, cloud-native processing tools.",
    heroSubtitleGuestBold: "Start free. Upgrade anytime.",
    authBannerProAccess: "Access: All Premium Workspaces & Advanced Tools",
    authBannerFreeUsage: "Daily Usage: 5 operations remaining today",
    authBannerFreeAction: "Upgrade to Pro",
    feature1Title: "Free Tier Included",
    feature1Description: "Access baseline document utilities instantly with zero upfront costs or mandatory payment thresholds.",
    feature2Title: "Pro Ecosystem",
    feature2Description: "Unlock high-performance processing architectures, interactive digital canvas features, and massive filesizes.",
    feature3Title: "Isolated Sandbox",
    feature3Description: "Secure corporate sandboxes compile your parameters layout grids. Data clears instantly post compilation.",
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