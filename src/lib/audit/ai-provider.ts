export interface AiRequestOptions {
  provider?: "openai" | "anthropic";
  model?: string;
  imageUrls?: string[];
  reasoningEffort?: "low" | "medium" | "high";
}

export interface AiProvider { json<T>(system: string, input: string, options?: AiRequestOptions): Promise<T>; }

function parseJson<T>(value: string): T {
  const cleaned = value.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

class OpenAiProvider implements AiProvider {
  async json<T>(system: string, input: string, options: AiRequestOptions = {}) {
    const content: Array<Record<string, string>> = [{ type: "input_text", text: input }];
    for (const imageUrl of options.imageUrls ?? []) content.push({ type: "input_image", image_url: imageUrl, detail: "high" });
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: options.model ?? process.env.OPENAI_EXPERT_MODEL ?? "gpt-5.4-mini", store: false, instructions: system, input: [{ role: "user", content }], reasoning: { effort: options.reasoningEffort ?? "low" }, text: { verbosity: "low", format: { type: "json_object" } } }) });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
    const body = await response.json() as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const outputText = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
    return parseJson<T>(outputText);
  }
}

class AnthropicProvider implements AiProvider {
  async json<T>(system: string, input: string, options: AiRequestOptions = {}) {
    const content: unknown[] = (options.imageUrls ?? []).map((url) => ({ type: "image", source: { type: "url", url } }));
    content.push({ type: "text", text: `${input}\n\nReturn only one JSON object.` });
    const model = options.model ?? (options.reasoningEffort === "medium" ? process.env.ANTHROPIC_REVIEW_MODEL : process.env.ANTHROPIC_EXPERT_MODEL);
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5", max_tokens: 4000, temperature: 0.2, system, messages: [{ role: "user", content }] }) });
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
    const body = await response.json() as { content?: { type: string; text?: string }[] };
    return parseJson<T>(body.content?.find((item) => item.type === "text")?.text ?? "");
  }
}

let openAiProvider: AiProvider | null = null;
let anthropicProvider: AiProvider | null = null;
export function getAiProvider(requested?: "openai" | "anthropic") {
  const selected = requested ?? process.env.AI_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "anthropic");
  if (selected === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing.");
    anthropicProvider ??= new AnthropicProvider();
    return anthropicProvider;
  } else {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing.");
    openAiProvider ??= new OpenAiProvider();
    return openAiProvider;
  }
}
