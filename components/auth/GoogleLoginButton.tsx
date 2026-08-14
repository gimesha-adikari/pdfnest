"use client";

import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { fetchJson } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { notify } from "@/lib/notify";
import { safeRedirectPath } from "@/lib/safeRedirect";

interface GoogleLoginButtonProps {
    onSuccessCallback?: () => void;
    policyAccepted: boolean;
}

export default function GoogleLoginButton({
                                              onSuccessCallback,
                                              policyAccepted,
                                          }: GoogleLoginButtonProps) {
    const { refreshSession } = useAuth();

    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            if (!policyAccepted) {
                notify(
                    "Please accept the Privacy Policy and Terms of Service before signing up with Google.",
                    "error"
                );
                return;
            }

            await fetchJson("/auth/google", {
                method: "POST",
                body: JSON.stringify({
                    id_token: credentialResponse?.credential,
                    policy_accepted: policyAccepted,
                }),
            });

            await refreshSession();

            if (onSuccessCallback) {
                onSuccessCallback();
            } else {
                const searchParams = new URLSearchParams(window.location.search);
                window.location.href = safeRedirectPath(searchParams.get("callbackUrl"));
            }
        } catch (err: any) {
            const msg = (err.message || "").toLowerCase();

            if (msg.includes("policy")) {
                notify(
                    "Please accept the Privacy Policy and Terms of Service before signing up with Google.",
                    "error"
                );
            } else {
                notify(`Authentication failed: ${err.message}`, "error");
            }
        }
    };

    return (
        <div className="w-full flex justify-center py-2 px-4 rounded-xl transition-all duration-150">
            <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => console.error("Google authentication channel failure.")}
                useOneTap={false}
                auto_select={false}
                theme="filled_black"
                shape="circle"
            />
        </div>
    );
}