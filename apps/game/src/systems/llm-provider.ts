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
  /** Explicit provider ordering for OpenRouter (e.g. ["Groq"] for prompt caching). */
  providerOrder?: string[];
  // Thinking (big) model — used for goal-setting and on-demand reasoning
  thinkingModel: string;
  thinkingReasoningEffort: ReasoningEffort;
  thinkingProviderSort: ProviderSort;
}

export interface LLMContentBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string | LLMContentBlock[];
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

export const PROVIDER_ORDER: LLMProviderType[] = ["custom"];

export function defaultConfig(): LLMProviderConfig {
  return {
    provider: "custom",
    apiKey: "",
    model: DEFAULT_MODELS.custom,
    endpointUrl: DEFAULT_ENDPOINTS.custom,
    reasoningEffort: "low",
    providerSort: "latency",
    providerOrder: ["Groq"],
    thinkingModel: "google/gemini-2.5-flash",
    thinkingReasoningEffort: "high",
    thinkingProviderSort: "latency",
  };
}

/** Flatten content blocks to a plain string (for providers that don't support blocks). */
function flattenContent(content: string | LLMContentBlock[]): string {
  if (typeof content === "string") return content;
  return content.map((b) => b.text).join("\n\n");
}

// ── Provider dispatch ────────────────────────────────────────────────

export async function callLLM(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  signal?: AbortSignal,
  maxTokens?: number,
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
        return await callOpenRouter(config, messages, signal, maxTokens);
      default:
        return { text: "", error: `Unknown provider: ${String(config.provider)}` };
    }
  } catch (err) {
    if (signal?.aborted) return { text: "", error: "Request aborted" };
    return { text: "", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Call the thinking (big) model. Uses the thinkingModel, thinkingReasoningEffort,
 * and thinkingProviderSort from the config, with a higher max_tokens budget.
 */
export async function callThinkingLLM(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  signal?: AbortSignal,
): Promise<LLMResponse> {
  // Build a config override with the thinking model settings
  const thinkingConfig: LLMProviderConfig = {
    ...config,
    model: config.thinkingModel || config.model,
    reasoningEffort: config.thinkingReasoningEffort ?? "high",
    providerSort: config.thinkingProviderSort ?? "latency",
    // providerOrder is inherited — if Groq has the model, it gets caching;
    // if not (e.g. Gemini), OpenRouter falls back to the correct provider.
  };
  return callLLM(thinkingConfig, messages, signal, 16000);
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
    messages: nonSystem.map((m) => ({ role: m.role, content: flattenContent(m.content) })),
  };
  if (systemMsg) {
    body.system = flattenContent(systemMsg.content);
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
      messages: messages.map((m) => ({ role: m.role, content: flattenContent(m.content) })),
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
      messages: messages.map((m) => ({ role: m.role, content: flattenContent(m.content) })),
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
  maxTokens?: number,
): Promise<LLMResponse> {
  const resp = await fetch(`${config.endpointUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens ?? 2048,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      reasoning: { effort: config.reasoningEffort || "low" },
      provider: {
        ...(config.providerOrder?.length ? { order: config.providerOrder } : {}),
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
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      // OpenRouter/Groq format
      prompt_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
      // Anthropic format (fallback)
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  if (data.error) {
    return { text: "", error: `OpenRouter error: ${data.error.message}` };
  }

  // Log prompt caching stats when available (check both response formats)
  if (data.usage) {
    const details = data.usage.prompt_tokens_details;
    const cached = details?.cached_tokens ?? data.usage.cache_read_input_tokens ?? 0;
    const total = data.usage.prompt_tokens ?? 0;
    if (cached > 0) {
      const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
      console.log(`[LLM] Cache hit: ${cached}/${total} prompt tokens cached (${pct}%)`);
    }
  }

  const choice = data.choices?.[0];
  let content = choice?.message?.content;

  // Reasoning models may put all tokens into reasoning with null content.
  // Try to extract an XML action or JSON action from the reasoning text as a fallback.
  if (!content && choice?.message?.reasoning) {
    const reasoning = choice.message.reasoning;
    // Try XML self-closing element first: <action_name .../>
    const xmlMatch = reasoning.match(/<(\w+)(?:\s+\w+="[^"]*")*\s*\/>/);
    if (xmlMatch) {
      content = xmlMatch[0];
      console.info("[LLM] Extracted XML action from reasoning:", content);
    } else {
      // Fallback to JSON extraction
      const jsonMatch = reasoning.match(/\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
        console.info("[LLM] Extracted JSON action from reasoning:", content);
      } else {
        console.warn("[LLM] OpenRouter: content null, reasoning had no action");
      }
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
