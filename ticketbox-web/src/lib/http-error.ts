type ApiErrorPayload = {
  message?: string;
  detail?: string;
  error?: string;
  errors?: Array<{
    field?: string;
    message?: string;
  }>;
};

export function apiErrorMessage(text: string, status: number, fallback = "Request failed") {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized.startsWith("<!doctype") || normalized.startsWith("<html")) {
    return status >= 500
      ? "The service is temporarily unavailable. Please try again."
      : fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const payload = parsed as ApiErrorPayload;
      const fieldErrors = payload.errors
        ?.map((item) => [item.field, item.message].filter(Boolean).join(": "))
        .filter(Boolean);
      if (fieldErrors?.length) {
        return fieldErrors.join(". ");
      }
      return payload.detail || payload.message || payload.error || statusFallback(status, fallback);
    }
    return statusFallback(status, fallback);
  } catch {
    return trimmed || statusFallback(status, fallback);
  }
}

function statusFallback(status: number, fallback: string) {
  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) {
    return "You do not have permission to perform this action.";
  }
  if (status === 409) {
    return "This action conflicts with the latest data. Refresh and try again.";
  }
  if (status >= 500) {
    return "The service is temporarily unavailable. Please try again.";
  }
  return fallback;
}
