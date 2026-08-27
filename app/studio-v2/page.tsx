"use client";

import React from "react";
import { StudioV2Shell } from "@/components/studio-v2/StudioV2Shell";

export default function StudioV2Page() {
  return (
    <React.Suspense fallback={null}>
      <StudioV2Shell />
    </React.Suspense>
  );
}
