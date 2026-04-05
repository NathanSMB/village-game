// ── LLM Provider Abstraction ─────────────────────────────────────────
//
// Pure fetch-based calls to Claude, OpenAI, Ollama, or any
// OpenAI-compatible endpoint.  No SDK dependencies.

export type LLMProviderType = "claude" | "openai" | "ollama" | "custom";

export type ReasoningEffort = "none" | "low" | "medium" | "high";
export type ProviderSort = "price" | "throughput" | "latency";

export const REASONING_EFFORT_ORDER: ReasoningEffort[] = ["none", "low", "medium", "high"];
export const PROVIDER_SORT_ORDER: ProviderSort[] = ["price", "throughput", "latency"];

export interface LLMProviderConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  endpointUrl: string;
  reasoningEffort: ReasoningEffort;
  providerSort: ProviderSort;
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
  custom: "openai/gpt-oss-120b",
};

export const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  claude: "Claude",
  openai: "OpenAI",
  ollama: "Ollama",
  custom: "OpenRouter",
};

export const PROVIDER_ORDER: LLMProviderType[] = ["custom", "claude", "openai", "ollama"];

export function defaultConfig(): LLMProviderConfig {
  return {
    provider: "custom",
    apiKey: "",
    model: DEFAULT_MODELS.custom,
    endpointUrl: DEFAULT_ENDPOINTS.custom,
    reasoningEffort: "low",
    providerSort: "latency",
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
        return await callOpenRouter(config, messages, signal);
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

  const data = (await resp.json()) as {
    content?: { type: string; text: string }[];
    error?: { type: string; message: string };
  };
  if (data.error) {
    return { text: "", error: `Claude error: ${data.error.type} — ${data.error.message}` };
  }
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    console.warn("[LLM] Claude returned no text block:", JSON.stringify(data));
  }
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
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    error?: { message: string; type: string; code?: string };
  };
  if (data.error) {
    return { text: "", error: `OpenAI error: ${data.error.message}` };
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.warn("[LLM] OpenAI returned no content:", JSON.stringify(data));
  }
  return { text: content ?? "" };
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

// ── OpenRouter (OpenAI-compatible + provider sorting) ────────────────

async function callOpenRouter(
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
      max_tokens: 512,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      reasoning: { effort: config.reasoningEffort || "low" },
      provider: {
        sort: config.providerSort || "latency",
      },
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    return { text: "", error: `OpenRouter ${resp.status}: ${errText}` };
  }

  const data = (await resp.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        reasoning?: string | null;
      };
      finish_reason?: string;
    }[];
    error?: { message: string; type: string; code?: string };
  };
  if (data.error) {
    return { text: "", error: `OpenRouter error: ${data.error.message}` };
  }

  const choice = data.choices?.[0];
  let content = choice?.message?.content;

  // Reasoning models may put all tokens into reasoning with null content.
  // Try to extract a JSON action from the reasoning text as a fallback.
  if (!content && choice?.message?.reasoning) {
    const reasoning = choice.message.reasoning;
    const jsonMatch = reasoning.match(/\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
      console.info("[LLM] Extracted action from reasoning:", content);
    } else {
      console.warn("[LLM] OpenRouter: content null, reasoning had no JSON action");
    }
  }

  if (!content) {
    const reason = choice?.finish_reason;
    if (reason === "length") {
      console.warn("[LLM] OpenRouter: response truncated (finish_reason=length)");
    } else {
      console.warn("[LLM] OpenRouter returned no content:", JSON.stringify(data).slice(0, 500));
    }
  }
  return { text: content ?? "" };
}
