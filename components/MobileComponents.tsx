import Link from "next/link";
import {NAV_TOOLS} from "@/lib/toolsData";

type Category =
    | "all"
    | "organize"
    | "edit"
    | "convert"
    | "create"
    | "security"
    | "optimize"
    | "studio";

export function MobileLink({
                               href,
                               icon,
                               text,
                               close
                           }: {
    href: string;
    icon: React.ReactNode;
    text: string;
    close: () => void;
}) {

    return (

        <Link
            href={href}
            onClick={close}
            className="
flex
items-center
gap-3
rounded-xl
px-3
py-3
text-sm
font-semibold

hover:bg-indigo-500/10
hover:text-indigo-500

transition
"
        >

            {icon}

            {text}

        </Link>

    )

}

export function ToolGroup({
                              title,
                              icon,
                              category,
                              close
                          }: {
    title: string;
    icon: React.ReactNode;
    category: Category;
    close: () => void;
}) {


    const tools = NAV_TOOLS.filter(
        t => t.category === category
    );


    return (

        <div className="mt-6">


            <div className="
flex
items-center
gap-2
text-xs
font-black
uppercase
tracking-wider
text-[color:var(--muted)]
mb-2
">

                {icon}

                {title}

            </div>


            <div className="space-y-1">


                {tools.map(tool => (

                    <Link
                        key={tool.href}
                        href={tool.href}
                        onClick={close}
                        className="
block

rounded-xl

px-3
py-2

text-sm

hover:bg-[var(--background)]

transition
"
                    >

                        <div className="flex justify-between">

<span>
{tool.title}
</span>


                            {tool.isNew && (
                                <span className="
text-[9px]
px-2
py-0.5
rounded-full
bg-indigo-500
text-white
font-black
">
NEW
</span>
                            )}

                        </div>


                    </Link>

                ))}


            </div>


        </div>

    )

}

