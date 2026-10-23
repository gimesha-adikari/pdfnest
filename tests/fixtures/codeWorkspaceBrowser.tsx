// Local-only integration fixture. Production components and execution are real;
// the server supplies only framework/auth/catalog context and a loopback API.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Layout, { useSharedTool } from "../../app/(site)/[toolId]/ClientToolLayout";
import Workspace from "../../components/tools/CodeToPdfWorkspace";
import Download from "../../app/(site)/[toolId]/download/page";
import Notifications from "../../components/ui/GlobalNotifications";
import { telemetry } from "../../lib/execution/telemetry";

type Harness = {
    navigate: (url: string) => void;
    delayAuth: boolean;
    authCallbacks: Array<() => void>;
    snapshot: () => unknown;
};
declare global { interface Window { codeHarness: Harness } }
window.codeHarness = { navigate: () => {}, delayAuth: false, authCallbacks: [], snapshot: () => null };

function Harness() {
    const shared = useSharedTool();
    const [route, setRoute] = useState("workspace");
    useEffect(() => {
        window.codeHarness.navigate = url => setRoute(url.endsWith("/download") ? "download" : "workspace");
        window.codeHarness.snapshot = () => ({
            file: shared.file?.name, staged: Boolean(shared.downloadData),
            outputName: shared.downloadData?.fileName,
            generationMatches: Boolean(shared.downloadData?.source?.generation === shared.conversionGeneration),
            events: telemetry.getEvents(),
        });
    }, [shared]);
    return <>
        <label>Choose synthetic source <input id="source" type="file" onChange={event => shared.setFile(event.target.files?.[0] || null)} /></label>
        <button onClick={() => setRoute("workspace")}>Workspace</button>
        <button onClick={() => setRoute("download")}>Download route</button>
        <label><input type="checkbox" onChange={event => { window.codeHarness.delayAuth = event.target.checked; }} />Delay authentication</label>
        <button onClick={() => window.codeHarness.authCallbacks.splice(0).forEach(action => action())}>Complete authentication</button>
        <Notifications />
        {route === "download" ? <Download /> : <Workspace />}
    </>;
}
createRoot(document.getElementById("root")!).render(<Layout><Harness /></Layout>);
