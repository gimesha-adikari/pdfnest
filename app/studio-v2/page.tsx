"use client";

import React from "react";
import dynamic from "next/dynamic";

// Dynamic import with SSR disabled to guarantee clean browser hydration for canvas & window event listeners
const StudioV2Shell = dynamic(
  () =>
    import("@/components/studio-v2/StudioV2Shell").then(
      (mod) => mod.StudioV2Shell
    ),
  { ssr: false }
);

export default function StudioV2Page() {
  return <StudioV2Shell />;
}
