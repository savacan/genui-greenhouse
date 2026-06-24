import { createAzure } from "@ai-sdk/azure";
import type { LanguageModel } from "ai";

/**
 * THE provider seam. Default = Azure OpenAI (env-driven).
 * public 化するときは、この import と createAzure(...) の1ブロックだけを
 * 別プロバイダ（createOpenAI / createGoogleGenerativeAI 等）に差し替える。
 */
let cached: LanguageModel | null = null;

export function getModel(): LanguageModel {
  if (cached) return cached;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const resourceName = process.env.AZURE_RESOURCE_NAME;
  if (!apiKey || !resourceName) {
    throw new Error(
      "LLM 未設定: .env.local に AZURE_OPENAI_API_KEY + AZURE_RESOURCE_NAME（+ AZURE_OPENAI_DEPLOYMENT）を設定してください。",
    );
  }
  const azure = createAzure({ apiKey, resourceName });
  cached = azure(process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o");
  return cached;
}
