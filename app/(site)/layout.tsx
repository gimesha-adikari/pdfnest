import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GlobalNotifications from "@/components/ui/GlobalNotifications";
import CommandSystem from "@/components/CommandSystem";
import MobileNav from "@/components/ui/MobileNav";
import AuthModal from "@/components/auth/AuthModal";
import PaddleTransactionBridge from "@/components/paddle/PaddleTransactionBridge";

export default function SiteLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex flex-col relative isolation-auto">
            <Header />
            <main className="flex-1 w-full relative z-10 pb-20 md:pb-0">
                <GlobalNotifications />
                <AuthModal />
                <PaddleTransactionBridge />
                {children}
                <CommandSystem />
            </main>
            <MobileNav />
            <Footer />
        </div>
    );
}