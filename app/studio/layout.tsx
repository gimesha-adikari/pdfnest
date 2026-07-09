import GlobalNotifications from "@/components/ui/GlobalNotifications";
import AuthModal from "@/components/auth/AuthModal";

export default function StudioLayout({
                                         children,
                                     }: {
    children: React.ReactNode;
}) {
    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
            <GlobalNotifications />
            <AuthModal />
            <div className="h-full w-full overflow-hidden">{children}</div>
        </div>
    );
}