import axios from "axios";
import { ApiError } from "../errors/appError.js";

type AbdmEnvironment = "SANDBOX" | "PRODUCTION";

interface GenerateSessionTokenParams {
  clientId: string;
  clientSecret: string;
  environment: AbdmEnvironment;
}

export const generateAbdmSessionToken = async ({
  clientId,
  clientSecret,
  environment,
}: GenerateSessionTokenParams) => {
  const Url = environment === "SANDBOX"? process.env.SANDBOX_SESSION_URL : process.env.PROD_SESSION_URL;

  const cmId = environment === "SANDBOX" ? "sbx" : "abdm";

  const requestId = crypto.randomUUID();
  try {
    const response = await axios.post(
      `${Url}`,
      { clientId, clientSecret, grantType: "client_credentials" },
      {
        timeout: 15_000,
        headers: {
          "Content-Type": "application/json",
          "REQUEST-ID": requestId,
          "TIMESTAMP": new Date().toISOString(),
          "X-CM-ID": cmId,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("ABDM session request failed", {
        requestId,
        status: error.response?.status,
        code: error.code,
        timedOut: error.code === "ECONNABORTED",
      });
      if (!error.response || error.response.status >= 500 || error.code === "ECONNABORTED") {
        throw new ApiError(503, "ABHA service is temporarily unavailable. Please try again.");
      }
      if (error.response.status === 401 || error.response.status === 403) {
        throw new ApiError(502, "ABDM rejected authentication. Check the configured credentials and environment.");
      }
      throw new ApiError(502, "ABDM could not issue a session token. Check the credentials and try again.");
    }
    throw error;
  }
};
