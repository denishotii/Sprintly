/**
 * E2E test prompts for pipeline simulation (M12).
 * Use with: npm run simulate -- --test <key>
 *
 * Keys by mode:
 *   website:  landing, portfolio
 *   web-app:  taskapp, weather, quiz
 *   react-app: react
 *   python:   python, flask
 *   node:     node, express
 */

export const E2E_PROMPTS: Record<string, string> = {
  // ─── Website (static)
  landing: "Create a landing page for a SaaS product",
  portfolio: "Build a portfolio website for a photographer",

  // ─── Web-app (vanilla JS / Alpine)
  taskapp: "Create a task management app",
  weather: "Build a weather dashboard",
  quiz: "Build a quiz/trivia app",

  // ─── React (CDN, no build)
  react:
    "Create a React todo app with add, complete, and delete functionality",

  // ─── Python
  python:
    "Generate a Python script that fetches current weather data for a given city using the OpenWeatherMap API",
  flask:
    "Build a Python Flask web app with a REST API for managing a todo list",

  // ─── Node
  node: "Build a Node.js CLI tool that reads a CSV file and converts it to JSON",
  express:
    "Build a Node.js Express API with CRUD endpoints for managing books",
};

export const E2E_PROMPT_KEYS = Object.keys(E2E_PROMPTS);

export function getTestPrompt(key: string): string | undefined {
  return E2E_PROMPTS[key];
}

/** Human-readable list of test keys for CLI help. */
export const E2E_PROMPT_KEYS_HELP = E2E_PROMPT_KEYS.join(", ");
