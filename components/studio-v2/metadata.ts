import type { StudioMetadataParameters } from "@/lib/studio-v2/api";

export function studioMetadataDefaults(metadata?: Record<string, string> | null): StudioMetadataParameters {
  return {
    title: metadata?.Title ?? metadata?.title ?? "",
    author: metadata?.Author ?? metadata?.author ?? "",
    subject: metadata?.Subject ?? metadata?.subject ?? "",
    keywords: metadata?.Keywords ?? metadata?.keywords ?? "",
  };
}
