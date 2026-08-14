import React from "react";
import * as Icons from "lucide-react";

interface IconResolverProps {
    name?: string;
    className?: string;
}

export function IconResolver({ name, className = "h-5 w-5" }: IconResolverProps) {
    const IconComponent = (name && (Icons as any)[name]) || Icons.FileText;
    return <IconComponent className={className} />;
}

export default IconResolver;
