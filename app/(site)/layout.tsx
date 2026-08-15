import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GlobalNotifications from "@/components/ui/GlobalNotifications";
import CommandSystem from "@/components/CommandSystem";
import MobileNav from "@/components/ui/MobileNav";
import AuthModal from "@/components/auth/AuthModal";
import PaddleTransactionBridge from "@/components/paddle/PaddleTransactionBridge";
import BackendStatusBanner from "@/components/ui/BackendStatusBanner";
import { getTools } from "@/lib/server/tools";
import { ToolProvider } from "@/context/ToolContext";

export default async function SiteLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    const initialTools = await getTools();

    return (
        <ToolProvider initialTools={initialTools}>
            <div className="min-h-screen flex flex-col relative isolation-auto">
                <BackendStatusBanner />
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
        </ToolProvider>
    );
}