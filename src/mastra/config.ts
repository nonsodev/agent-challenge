
// ollama config
import dotenv from "dotenv";
import { createOllama } from "ollama-ai-provider";

// Load environment variables once at the beginning
dotenv.config();

// Export all your environment variables
// Defaults to Ollama qwen2.5:1.5b
// https://ollama.com/library/qwen2.5
export const modelName = process.env.MODEL_NAME_AT_ENDPOINT ?? "qwen2.5:1.5b";
export const baseURL = process.env.API_BASE_URL ?? "http://127.0.0.1:11434/api";

// Create and export the model instance
export const model = createOllama({ baseURL }).chat(modelName, {
  simulateStreaming: true,
});

console.log(`ModelName: ${modelName}\nbaseURL: ${baseURL}`);

// Google config
// import dotenv from "dotenv";
// import { google } from "@ai-sdk/google";

// dotenv.config();

// const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
// if (!apiKey) {
//   throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
// }

// export const modelName = "gemini-2.5-flash";

// // Create a standalone Gemini model instance
// export const model = google(modelName, { apiKey, simulateStreaming: true });

// console.log(`Model configured: ${modelName}`);


// Groq config
// import dotenv from "dotenv";
// import { createGroq } from "@ai-sdk/groq";          // Groq provider for the Vercel AI SDK

// // Load env vars once
// dotenv.config();

// // Grab credentials
// const apiKey  = process.env.GROQ_API_KEY;
// if (!apiKey) {
//   throw new Error("Missing GROQ_API_KEY");
// }

// // Optional self‑host / proxy endpoint; defaults to Groq Cloud
// export const baseURL =
//   process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";

// // Pick any Groq‑hosted model you like
// // (See https://console.groq.com for the complete list)
// export const modelName = "qwen/qwen3-32b";

// // Build a provider instance and expose a streaming‑friendly chat model
// export const model = createGroq({ apiKey, baseURL }).chat(modelName, {
//   simulateStreaming: true,
// });

// console.log(`Groq model configured: ${modelName}\nbaseURL: ${baseURL}`);
