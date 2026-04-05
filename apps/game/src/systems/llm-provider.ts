// ── LLM Provider Abstraction ─────────────────────────────────────────
//
// Pure fetch-based calls to Claude, OpenAI, Ollama, or any
// OpenAI-compatible endpoint.  No SDK dependencies.

export type LLMProviderType = "claude" | "openai" | "ollama" | "custom";

export interface LLMProviderConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  endpointUrl: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  error?: string;
}

export const DEFAULT_ENDPOINTS: Record<LLMProviderType, string> = {
  claude: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  ollama: "http://localhost:11434",
  custom: "https://openrouter.ai/api",
};

export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  claude: "claude-haiku-4-5-20251001",
  openai: "gpt-5.4-nano",
  ollama: "llama3",
  custom: "moonshotai/kimi-k2.5",
};

export const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  claude: "Claude",
  openai: "OpenAI",
  ollama: "Ollama",
  custom: "Custom",
};

export const PROVIDER_ORDER: LLMProviderType[] = ["claude", "openai", "ollama", "custom"];

export function defaultConfig(): LLMProviderConfig {
  return {
    provider: "claude",
    apiKey: "",
    model: DEFAULT_MODELS.claude,
    endpointUrl: DEFAULT_ENDPOINTS.claude,
  };
}

// ── Provider dispatch ────────────────────────────────────────────────

export async function callLLM(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  signal?: AbortSignal,
): Promise<LLMResponse> {
  try {
    switch (config.provider) {
      case "claude":
        return await callClaude(config, messages, signal);
      case "openai":
        return await callOpenAI(config, messages, signal);
      case "ollama":
        return await callOllama(config, messages, signal);
      case "custom":
        return await callOpenAI(config, messages, signal); // custom uses OpenAI format
      default:
        return { text: "", error: `Unknown provider: ${String(config.provider)}` };
    }
  } catch (err) {
    if (signal?.aborted) return { text: "", error: "Request aborted" };
    return { text: "", error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Claude (Anthropic Messages API) ──────────────────────────────────

async function callClaude(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  signal?: AbortSignal,
): Promise<LLMResponse> {
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 256,
    messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
  };
  if (systemMsg) {
    body.system = systemMsg.content;
  }

  const resp = await fetch(`${config.endpointUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    return { text: "", error: `Claude API ${resp.status}: ${errText}` };
  }

  const data = (await resp.json()) as { content?: { type: string; text: string }[] };
  const textBlock = data.content?.find((b) => b.type === "text");
  return { text: textBlock?.text ?? "" };
}

// ── OpenAI (Chat Completions API) ────────────────────────────────────

async function callOpenAI(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  signal?: AbortSignal,
): Promise<LLMResponse> {
  const resp = await fetch(`${config.endpointUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 256,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    return { text: "", error: `OpenAI API ${resp.status}: ${errText}` };
  }

  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

// ── Ollama (local chat API) ──────────────────────────────────────────

async function callOllama(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  signal?: AbortSignal,
): Promise<LLMResponse> {
  const resp = await fetch(`${config.endpointUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    return { text: "", error: `Ollama ${resp.status}: ${errText}` };
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  return { text: data.message?.content ?? "" };
}
