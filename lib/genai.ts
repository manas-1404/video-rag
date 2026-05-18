import { GoogleGenAI } from "@google/genai";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.GCP_PROJECT_ID) throw new Error("GCP_PROJECT_ID is not set");
if (!process.env.GCP_PROJECT_NUMBER) throw new Error("GCP_PROJECT_NUMBER is not set");
if (!process.env.GCP_SERVICE_ACCOUNT_EMAIL) throw new Error("GCP_SERVICE_ACCOUNT_EMAIL is not set");
if (!process.env.GCP_WORKLOAD_IDENTITY_POOL_ID) throw new Error("GCP_WORKLOAD_IDENTITY_POOL_ID is not set");
if (!process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID) throw new Error("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID is not set");
if (!process.env.GOOGLE_CLOUD_LOCATION) throw new Error("GOOGLE_CLOUD_LOCATION is not set");
if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY is not set");

const authClient = ExternalAccountClient.fromJSON({
  type: "external_account",
  audience: `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
  token_url: "https://sts.googleapis.com/v1/token",
  service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
  subject_token_supplier: {
    getSubjectToken: () => getVercelOidcToken(),
  },
});

if (!authClient) throw new Error("Failed to initialize GCP auth client");

export const genAI = new GoogleGenAI({
  enterprise: true,
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_LOCATION,
  googleAuthOptions: {
    authClient,
    projectId: process.env.GCP_PROJECT_ID,
  },
});

export const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
