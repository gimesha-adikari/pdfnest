import ToolSchema from "@/components/SEO/ToolSchema";


export default function ToolSEO({
                                    href
                                }: {
    href: string;
}) {

    return (
        <>
            <ToolSchema toolHref={href}/>

        </>
    );
}