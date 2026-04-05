import { saveSettings, loadSettings } from "./save-manager.ts";
import {
  type LLMProviderConfig,
  type LLMProviderType,
  defaultConfig,
  DEFAULT_ENDPOINTS,
  DEFAULT_MODELS,
} from "./llm-provider.ts";

const SETTINGS_KEY = "llm-config";

export async function loadLLMConfig(): Promise<LLMProviderConfig> {
  const raw = await loadSettings(SETTINGS_KEY);
  if (!raw || typeof raw !== "object") return defaultConfig();
  const saved = raw as Partial<LLMProviderConfig>;
  return {
    provider: saved.provider ?? "claude",
    apiKey: saved.apiKey ?? "",
    model: saved.model ?? DEFAULT_MODELS[saved.provider ?? "claude"],
    endpointUrl: saved.endpointUrl ?? DEFAULT_ENDPOINTS[saved.provider ?? "claude"],
  };
}

export async function saveLLMConfig(config: LLMProviderConfig): Promise<void> {
  await saveSettings(SETTINGS_KEY, config);
}

/**
 * When the provider changes, return smart defaults for endpoint and model.
 */
export function getProviderDefaults(provider: LLMProviderType): {
  endpointUrl: string;
  model: string;
} {
  return {
    endpointUrl: DEFAULT_ENDPOINTS[provider],
    model: DEFAULT_MODELS[provider],
  };
}
