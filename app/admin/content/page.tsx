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
                            // GORM fallback safety handler conversion if primitive
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
                alert("All Landing Page Content deployed successfully.");
            } else if (activeSection === "subscribe") {
                await fetchJson("/admin/site-content/subscribe", {
                    method: "PUT",
                    body: JSON.stringify(subData),
                });
                alert("All Plan Matrix parameters deployed successfully.");
            } else if (activeSection === "about") {
                await fetchJson("/admin/site-content/about", {
                    method: "PUT",
                    body: JSON.stringify(aboutData),
                });
                alert("About Page content properties published live successfully.");
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
                alert(`Successfully deployed updates across all (${toolsList.length}) application tools.`);
            }
        } catch (err) {
            alert("Failed executing config master commit workflow.");
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

    if (isLoading || isFetching) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#090a0f]">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#090a0f] p-4 md:p-8 text-slate-100">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header Actions */}
                <div className="flex items-center justify-between">
                    <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                        <ArrowLeft size={14} /> Back to Control panel
                    </Link>
                    <span className="text-xs font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full">
            Role: Admin
          </span>
                </div>

                {/* Info Card Banner */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[#11131e] p-6 border border-slate-800 rounded-2xl shadow-xl">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-black flex items-center gap-2.5">
                            <FileText className="text-indigo-500" size={26} /> Platform Content Engine
                        </h1>
                        <p className="text-xs text-slate-400 font-medium">
                            Configure landing descriptions, plan subscription matrix variations, workspace configurations, and specific About Studio layers.
                        </p>
                    </div>
                    <button
                        onClick={handleSaveAllContent}
                        disabled={isSavingAll}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/10 transition-all active:scale-98 disabled:opacity-40"
                    >
                        {isSavingAll ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Publish Live Updates
                    </button>
                </div>

                {/* Section Navigation Tabs Layout Selection */}
                <div className="flex flex-wrap gap-2 bg-[#11131e] p-1.5 border border-slate-800 rounded-xl w-fit">
                    {(["home", "subscribe", "about", "tools"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveSection(tab)}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize ${
                                activeSection === tab ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
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
                    <LandingPageContexts homeData={homeData} setHomeData={setHomeData} formatLabel={formatLabel} />
                )}

                {activeSection === "subscribe" && (
                    <PricingSubscriptionMatrices subData={subData} setSubData={setSubData} formatLabel={formatLabel} />
                )}

                {activeSection === "about" && (
                    <AboutPageContexts aboutData={aboutData} setAboutData={setAboutData} formatLabel={formatLabel} />
                )}

                {activeSection === "tools" && (
                    <WorkspaceConfigurations
                        toolsList={toolsList}
                        selectedToolHref={selectedToolHref}
                        setSelectedToolHref={setSelectedToolHref}
                        updateCurrentToolField={updateCurrentToolField}
                    />
                )}
            </div>
        </div>
    );
}