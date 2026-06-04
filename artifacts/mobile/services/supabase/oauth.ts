import * as QueryParams from "expo-auth-session/build/QueryParams";
import type { EmailOtpType } from "@supabase/supabase-js";

import { getSupabaseClient } from "./client";

function getFriendlyAuthErrorMessage(message: string) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("invalid refresh token") || lowerMessage.includes("refresh token not found")) {
    return "Votre ancienne session a expire. Reconnectez-vous.";
  }
  return message;
}

export async function completeOAuthSessionFromUrlAsync(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  await completeOAuthSessionFromParamsAsync({ ...parseUrlParams(url), ...params }, errorCode);
}

function parseUrlParams(url: string) {
  const parsedParams: Record<string, string> = {};
  const addParams = (value: string) => {
    const cleanValue = value.startsWith("?") || value.startsWith("#") ? value.slice(1) : value;
    new URLSearchParams(cleanValue).forEach((paramValue, key) => {
      parsedParams[key] = paramValue;
    });
  };

  try {
    const parsedUrl = new URL(url);
    addParams(parsedUrl.search);
    addParams(parsedUrl.hash);
  } catch {
    const [, query = ""] = url.split("?");
    const [queryPart = "", hashPart = ""] = query.split("#");
    addParams(queryPart);
    addParams(hashPart);
  }

  return parsedParams;
}

export async function completeOAuthSessionFromParamsAsync(
  params: Record<string, string>,
  errorCode?: string | null,
) {
  if (errorCode) throw new Error(errorCode);

  const supabase = getSupabaseClient();
  if (params.token_hash && params.type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: params.type as EmailOtpType,
    });
    if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
    return;
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
    return;
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
  }
}
