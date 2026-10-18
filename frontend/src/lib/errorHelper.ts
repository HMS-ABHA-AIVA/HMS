import { ApiError } from "@/api/client";

export interface MappedErrorState {
  tone: "error" | "pending" | "none";
  title: string;
  body: string;
  action?: { label: string; onClick?: () => void; ghost?: boolean };
}

type Action = MappedErrorState["action"];

/**
 * Shared mapper: maps HTTP status and backend message to StopState properties without raw JSON or stack traces.
 * The backend already words ABDM/UIDAI problems for staff (wrong Aadhaar, wrong OTP, cool-down ...), so that
 * message is shown as-is rather than being replaced by a guess.
 */
export function mapApiError(err: unknown, fallbackAction?: Action): MappedErrorState {
  if (!(err instanceof ApiError)) {
    return {
      tone: "error",
      title: "Something went wrong",
      body: err instanceof Error ? err.message : "An unexpected error occurred.",
      action: fallbackAction,
    };
  }

  const msg = err.message || "";

  if (err.status === 0 || /network|failed to fetch|cannot reach/i.test(msg)) {
    return {
      tone: "error",
      title: "Cannot reach the server",
      body: "Nothing was saved. Check your internet connection and that the hospital server is running, then try again.",
      action: fallbackAction ?? { label: "Try again" },
    };
  }

  if (/configure abdm|abdm authentication required/i.test(msg)) {
    return {
      tone: "error",
      title: "ABDM is not set up for this environment",
      body: /configure abdm/i.test(msg)
        ? "This hospital has no ABDM client ID saved for the configured environment. Ask the facility owner to add it in Facility setup."
        : "The connection to ABDM has lapsed and could not be renewed. Try again; if it keeps happening, sign out and back in.",
      action: fallbackAction ?? { label: "Back to patients", ghost: true },
    };
  }

  if (err.status === 401) {
    if (/abha verification session/i.test(msg)) {
      return {
        tone: "pending",
        title: "ABHA verification has ended",
        body: "The verification session for this ABHA is no longer active. Verify the ABHA again to see live details.",
        action: fallbackAction,
      };
    }
    return {
      tone: "pending",
      title: "You have been signed out",
      body: "Your sign-in has run out. Sign in again to carry on. Anything you had not saved will need to be entered again.",
      action: { label: "Sign in", onClick: () => window.location.assign("/login") },
    };
  }

  if (err.status === 409) {
    return {
      tone: "error",
      title: /another patient/i.test(msg) ? "ABHA belongs to another patient" : "Patient already has an ABHA",
      body: /another patient/i.test(msg)
        ? msg
        : "A patient can have only one ABHA on their record. Open the record to see it, or go back and pick another patient.",
      action: fallbackAction ?? { label: "Open patient record", ghost: true },
    };
  }

  if (err.status === 429) {
    return {
      tone: "pending",
      title: "Please wait before trying again",
      body: msg || "Too many attempts. Wait about 30 seconds before requesting another OTP.",
      action: fallbackAction,
    };
  }

  if (/expired/i.test(msg)) {
    return {
      tone: "pending",
      title: "The OTP has expired",
      body: "The 10-minute validity window for this OTP request has passed. Please start again.",
      action: fallbackAction ?? { label: "Start again" },
    };
  }

  if (err.status === 400 || err.status === 422) {
    return {
      tone: "error",
      title: /invalid request/i.test(msg) ? "Check the details entered" : "ABDM could not accept this",
      body: msg || "Please verify the information and try again.",
      action: fallbackAction ?? { label: "Try again" },
    };
  }

  if (err.status === 503 || err.status >= 500) {
    return {
      tone: "error",
      title: "Service temporarily unavailable",
      body: "ABDM or the hospital server is temporarily unreachable. Please wait a moment and try again.",
      action: fallbackAction ?? { label: "Try again" },
    };
  }

  return {
    tone: "error",
    title: "Action could not be completed",
    body: msg || "Please verify the information and try again.",
    action: fallbackAction,
  };
}
