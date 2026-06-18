import { MetadataRoute } from 'next';
import { NAV_TOOLS } from '@/lib/toolsData';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com';

export default function sitemap(): MetadataRoute.Sitemap {
    const staticPages = [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 1.0,
        },
        {
            url: `${BASE_URL}/about`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.5,
        },
        {
            url: `${BASE_URL}/tools`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'monthly' as const,
            priority: 0.3,
        },
    ];

    const toolPages = NAV_TOOLS.map((tool) => ({
        url: `${BASE_URL}${tool.href}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    }));

    return [...staticPages, ...toolPages];
}