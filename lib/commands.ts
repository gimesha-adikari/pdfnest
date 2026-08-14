import { NAV_TOOLS_FALLBACK } from "@/lib/toolsData";

export type Command = {
    id: string;
    title: string;
    description?: string;
    type: "tool" | "page" | "action";
    href?: string;
    action?: () => void;
};

export function getCommands(toolsList?: any[]): Command[] {
    const list = toolsList || NAV_TOOLS_FALLBACK;
    const toolCommands: Command[] = list.map((tool) => ({
        id: tool.href || tool.Href,
        title: tool.title || tool.Title,
        description: tool.description || tool.Description,
        type: "tool",
        href: tool.href || tool.Href,
    }));

    const pageCommands: Command[] = [
        {
            id: "home",
            title: "Home",
            type: "page",
            href: "/",
        },
        {
            id: "tools",
            title: "Tools Directory",
            type: "page",
            href: "/tools",
        },
        {
            id: "about",
            title: "About",
            type: "page",
            href: "/about",
        },
    ];

    const actionCommands: Command[] = [
        {
            id: "theme",
            title: "Toggle Theme",
            type: "action",
        },
    ];

    return [...pageCommands, ...toolCommands, ...actionCommands];
}