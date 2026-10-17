import { ApiError } from "@/api/client";

export interface MappedErrorState {
  tone: "error" | "pending" | "none";
  title: string;
  body: string;
  action?: { label: string; onClick?: () => void; ghost?: boolean };
}

/** Shared mapper: maps HTTP status and backend message to StopState properties without raw JSON or stack traces */
export function mapApiError(
  err: unknown,
  fallbackAction?: { label: string; onClick?: () => void; ghost?: boolean }
): MappedErrorState {
  if (err instanceof ApiError) {
    const msg = err.message || "";

    if (err.status === 0 || /network|failed to fetch|cannot reach/i.test(msg)) {
      return {
        tone: "error",
        title: "Cannot reach the server",
        body: "Nothing was saved. Check your internet connection and that the hospital server is running, then try again.",
        action: fallbackAction ?? { label: "Try again" },
      };
    }

    if (err.status === 401) {
      if (/abdm authentication|configure abdm/i.test(msg)) {
        return {
          tone: "error",
          title: "No ABDM details for Sandbox",
          body: "This hospital has no ABDM client ID saved for the configured environment. Ask the facility owner to add it in Facility setup.",
          action: fallbackAction ?? { label: "Back to patients", ghost: true },
        };
      }
      return {
        tone: "pending",
        title: "You have been signed out",
        body: "Your sign-in has run out. Sign in again to carry on. Anything you had not saved will need to be entered again.",
        action: { label: "Sign in", onClick: () => window.location.assign("/login") },
      };
    }

    if (err.status === 409 || /already has an abha|already linked/i.test(msg)) {
      return {
        tone: "error",
        title: "Patient already has an ABHA",
        body: "A patient can have only one ABHA on their record. Open the record to see it, or go back and pick another patient.",
        action: fallbackAction ?? { label: "Open patient record", ghost: true },
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

    if (/otp/i.test(msg) || err.status === 400) {
      return {
        tone: "error",
        title: "The OTP was not accepted",
        body: msg.includes("Invalid request body")
          ? msg
          : "Check the 6 digits with the patient. The code stays valid for 10 minutes. After that, start again from the Aadhaar number.",
        action: fallbackAction ?? { label: "Try the OTP again" },
      };
    }

    if (err.status >= 500) {
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

  const general = err instanceof Error ? err.message : "An unexpected error occurred.";
  return {
    tone: "error",
    title: "Something went wrong",
    body: general,
    action: fallbackAction,
  };
}
