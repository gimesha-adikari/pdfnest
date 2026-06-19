"use client";

import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { fetchJson } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface GoogleLoginButtonProps {
    onSuccessCallback?: () => void;
}

export default function GoogleLoginButton({ onSuccessCallback }: GoogleLoginButtonProps) {
    const { refreshSession } = useAuth();

    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            await fetchJson("/auth/google", {
                method: "POST",
                body: JSON.stringify({
                    id_token: credentialResponse.credential,
                }),
            });

            await refreshSession();

            if (onSuccessCallback) {
                onSuccessCallback();
            } else {
                window.location.href = "/";
            }
        } catch (err: any) {
            alert(`Authentication pipeline rejection layout: ${err.message}`);
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