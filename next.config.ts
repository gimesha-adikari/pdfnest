import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    allowedDevOrigins: ["192.168.8.124"],
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains",
                    },
                ],
            },
        ];
    },
    async redirects() {
        return [
            {
                source: "/ocr-pdf",
                destination: "/image-to-searchable-pdf",
                permanent: true,
            },
            {
                source: "/:path*",
                has: [
                    {
                        type: "host",
                        value: "www.platenpdf.com",
                    },
                ],
                destination: "https://platenpdf.com/:path*",
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
