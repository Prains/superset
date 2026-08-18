"use client";

import { toast } from "@superset/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Authorization was denied. Please try again.",
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	token_exchange_failed: "Failed to connect to Google. Please try again.",
	missing_scopes:
		"Both Calendar and Gmail access are required. Please allow both when asked.",
	no_refresh_token:
		"Google did not grant lasting access. Remove Superset from your Google account's third-party access and try again.",
	userinfo_failed: "Could not read the Google account. Please try again.",
	unauthorized: "You are not authorized to perform this action.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;
		const message = ERROR_MESSAGES[error] ?? "Something went wrong.";
		window.history.replaceState({}, "", "/integrations/google");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
