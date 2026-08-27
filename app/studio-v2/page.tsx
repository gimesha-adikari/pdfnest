"use client";

import React from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StudioV2Shell } from "@/components/studio-v2/StudioV2Shell";
import { useAuth } from "@/context/AuthContext";
import { safeRedirectPath } from "@/lib/safeRedirect";

function StudioV2AuthGate() {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      const returnTo = safeRedirectPath(`${pathname}${window.location.search}`);
      router.replace(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
    }
  }, [isLoading, isLoggedIn, pathname, router]);

  if (isLoading || !isLoggedIn) {
    return <div className="flex h-screen w-screen items-center justify-center bg-[#0B0C0F] text-xs text-[#9AA1AD]">Checking Studio access…</div>;
  }

  return <StudioV2Shell />;
}

export default function StudioV2Page() {
  return (
    <React.Suspense fallback={null}>
      <StudioV2AuthGate />
    </React.Suspense>
  );
}
