"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fetchJson } from "@/lib/api";
import { ArrowLeft, Loader2, Save, FileText } from "lucide-react";
import { NAV_TOOLS } from "@/lib/toolsData";

import LandingPageContexts from "@/components/admin/LandingPageContexts";
import PricingSubscriptionMatrices from "@/components/admin/PricingSubscriptionMatrices";
import WorkspaceConfigurations from "@/components/admin/WorkspaceConfigurations";
import AboutPageContexts from "@/components/admin/AboutPageContexts";
import { notify } from "@/lib/notify";

type ActiveTabSection = "home" | "subscribe" | "about" | "tools";

export default function AdminContentEditor() {
    const { isAuthenticated, isLoading, user } = useAuth();
    const router = useRouter();

    const [activeSection, setActiveSection] = useState<ActiveTabSection>("home");
    const [homeData, setHomeData] = useState<Record<string, string>>({});
    const [subData, setSubData] = useState<Record<string, string>>({});
    const [aboutData, setAboutData] = useState<Record<string, string>>({});
    const [toolsList, setToolsList] = useState<any[]>([]);
    const [selectedToolHref, setSelectedToolHref] = useState<string>("/merge-pdf");

    const [isFetching, setIsFetching] = useState(true);
    const [isSavingAll, setIsSavingAll] = useState(false);

    useEffect(() => {
        if (isLoading) return;

        if (!isAuthenticated || user?.role !== "admin") {
            router.push("/");
            return;
        }

        // eslint-disable-next-line react-hooks/immutability
        loadAllPlatformContent();
        // eslint-disable-next-line react-hooks/immutability
    }, [isLoading, isAuthenticated, user, router]);

    const loadAllPlatformContent = async () => {
        setIsFetching(true);

        try {
            const [home, subscribe, about, tools] = await Promise.all([
                fetchJson("/site-content/home"),
                fetchJson("/site-content/subscribe"),
                fetchJson("/site-content/about"),
                fetchJson("/site-content/tools") as Promise<any[]>,
            ]);

            const cleanData = (obj: any) => {
                const result: Record<string, string> = {};

                if (obj && typeof obj === "object") {
                    Object.keys(obj).forEach((key) => {
                        if (
                            key !== "id" &&
                            key !== "ID" &&
                            key !== "updatedAt" &&
                            key !== "createdAt"
                        ) {
                            result[key] = typeof obj[key] === "string" ? obj[key] : JSON.stringify(obj[key] || []);
                        }
                    });
                }

                return result;
            };

            setHomeData(cleanData(home));
            setSubData(cleanData(subscribe));
            setAboutData(cleanData(about));

            if (!tools || tools.length === 0) {
                const standardizedFallbackTools = NAV_TOOLS.map((staticTool, index) => ({
                    ID: index + 1,
                    Title: staticTool.title,
                    Description: staticTool.description,
                    Href: staticTool.href,
                    Category: staticTool.category,
                    KeywordsJson: JSON.stringify(staticTool.keywords || []),
                    SeoTitle: staticTool.seoTitle || "",
                    SeoDescription: staticTool.seoDescription || "",
                    Intent: staticTool.intent || "",
                    RelatedJson: JSON.stringify(staticTool.related || []),
                    FaqJson: JSON.stringify(staticTool.faq || []),
                    FeaturesJson: JSON.stringify(staticTool.features || []),
                    IsNew: staticTool.isNew || false,
                    Accept: staticTool.accept || "",
                    Multiple: staticTool.multiple || false,
                }));

                setToolsList(standardizedFallbackTools);

                if (standardizedFallbackTools.length > 0) {
                    setSelectedToolHref(standardizedFallbackTools[0].Href);
                }
            } else {
                setToolsList(tools);
                const baselineHref = tools[0].Href || tools[0].href;
                if (baselineHref) setSelectedToolHref(baselineHref);
            }
        } catch (err) {
            console.error("Failed loading backend content configurations", err);
        } finally {
            setIsFetching(false);
        }
    };

    const handleSaveAllContent = async () => {
        setIsSavingAll(true);

        try {
            if (activeSection === "home") {
                await fetchJson("/admin/site-content/home", {
                    method: "PUT",
                    body: JSON.stringify(homeData),
                });
                notify("All Landing Page Content deployed successfully.", "success");
            } else if (activeSection === "subscribe") {
                await fetchJson("/admin/site-content/subscribe", {
                    method: "PUT",
                    body: JSON.stringify(subData),
                });
                notify("All Plan Matrix parameters deployed successfully.", "success");
            } else if (activeSection === "about") {
                await fetchJson("/admin/site-content/about", {
                    method: "PUT",
                    body: JSON.stringify(aboutData),
                });
                notify("About Page content properties published live successfully.", "success");
            } else if (activeSection === "tools") {
                const savedToolsPromises = toolsList.map((toolItem) => {
                    const cleanToolPayload = { ...toolItem };

                    if (String(cleanToolPayload.ID).length < 3 && !isNaN(Number(cleanToolPayload.ID))) {
                        delete cleanToolPayload.ID;
                    }

                    return fetchJson("/admin/site-content/tools-config", {
                        method: "PUT",
                        body: JSON.stringify(cleanToolPayload),
                    });
                });

                const structuralUpdatedResponses = await Promise.all(savedToolsPromises);
                setToolsList(structuralUpdatedResponses);
                notify(`Successfully deployed updates across all (${toolsList.length}) application tools.`, "success");
            }
        } catch (err) {
            notify("Failed executing config master commit workflow.", "error");
        } finally {
            setIsSavingAll(false);
        }
    };

    const updateCurrentToolField = (fieldKey: string, newValue: any) => {
        setToolsList((prev) =>
            prev.map((tool) => {
                if ((tool.Href || tool.href) === selectedToolHref) {
                    return { ...tool, [fieldKey]: newValue };
                }
                return tool;
            })
        );
    };

    const formatLabel = (key: string) => {
        return key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase());
    };

    const pageSurface =
        "min-h-screen bg-[var(--background)] p-4 md:p-8 text-[var(--foreground)]";
    const panel =
        "rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-[0_18px_50px_rgba(0,0,0,0.08)]";
    const subtlePanel =
        "rounded-2xl border border-[color:var(--border)] bg-[var(--card)] shadow-[0_10px_28px_rgba(0,0,0,0.06)]";
    const topBar =
        "flex items-center justify-between gap-4";
    const primaryBtn =
        "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-500/10 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40";
    const tabBase =
        "px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize border border-transparent";
    const tabActive =
        "bg-[var(--primary)] text-white shadow-md";
    const tabInactive =
        "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--background)]";

    if (isLoading || isFetching) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
                <Loader2 className="animate-spin text-[var(--primary)]" size={32} />
            </div>
        );
    }

    return (
        <div className={pageSurface}>
            <div className="mx-auto max-w-6xl space-y-6">
                {/* Header Actions */}
                <div className={topBar}>
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-2 text-xs font-bold text-[var(--primary)] transition-colors hover:opacity-80"
                    >
                        <ArrowLeft size={14} /> Back to Control panel
                    </Link>

                    <span className="rounded-full border border-[color:var(--border)] bg-[var(--card)] px-3 py-1 font-mono text-xs text-[color:var(--muted-foreground)]">
            Role: Admin
          </span>
                </div>

                {/* Info Card Banner */}
                <div className={`${panel} flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between`}>
                    <div className="space-y-1">
                        <h1 className="flex items-center gap-2.5 text-2xl font-black text-[color:var(--foreground)]">
                            <FileText className="text-[var(--primary)]" size={26} />
                            Platform Content Engine
                        </h1>
                        <p className="text-xs font-medium text-[color:var(--muted-foreground)]">
                            Configure landing descriptions, plan subscription matrix variations, workspace configurations, and specific About Studio layers.
                        </p>
                    </div>

                    <button
                        onClick={handleSaveAllContent}
                        disabled={isSavingAll}
                        className={primaryBtn}
                    >
                        {isSavingAll ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Publish Live Updates
                    </button>
                </div>

                {/* Section Navigation Tabs */}
                <div className={`${subtlePanel} flex w-fit flex-wrap gap-2 p-1.5`}>
                    {(["home", "subscribe", "about", "tools"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveSection(tab)}
                            className={`${tabBase} ${
                                activeSection === tab ? tabActive : tabInactive
                            }`}
                        >
                            {tab === "home" && "Landing Page Contexts"}
                            {tab === "subscribe" && "Pricing & Subscription Matrices"}
                            {tab === "about" && "About Studio Layers"}
                            {tab === "tools" && `Workspace Configurations (${toolsList.length})`}
                        </button>
                    ))}
                </div>

                {/* Render View Routing Switchboards */}
                {activeSection === "home" && (
                    <div className={panel}>
                        <LandingPageContexts
                            homeData={homeData}
                            setHomeData={setHomeData}
                            formatLabel={formatLabel}
                        />
                    </div>
                )}

                {activeSection === "subscribe" && (
                    <div className={panel}>
                        <PricingSubscriptionMatrices
                            subData={subData}
                            setSubData={setSubData}
                            formatLabel={formatLabel}
                        />
                    </div>
                )}

                {activeSection === "about" && (
                    <div className={panel}>
                        <AboutPageContexts
                            aboutData={aboutData}
                            setAboutData={setAboutData}
                            formatLabel={formatLabel}
                        />
                    </div>
                )}

                {activeSection === "tools" && (
                    <div className={panel}>
                        <WorkspaceConfigurations
                            toolsList={toolsList}
                            selectedToolHref={selectedToolHref}
                            setSelectedToolHref={setSelectedToolHref}
                            updateCurrentToolField={updateCurrentToolField}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}