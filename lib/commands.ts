import { NAV_TOOLS } from "@/lib/toolsData";

export type Command = {
    id: string;
    title: string;
    description?: string;
    type: "tool" | "page" | "action";
    href?: string;
    action?: () => void;
};

export function getCommands(): Command[] {
    const toolCommands: Command[] = NAV_TOOLS.map((tool) => ({
        id: tool.href,
        title: tool.title,
        description: tool.description,
        type: "tool",
        href: tool.href,
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