/**
 * E2E test prompts for pipeline simulation (T12).
 * Use with: npm run cli simulate -- --test <key>
 */

export const E2E_PROMPTS: Record<string, string> = {
  portfolio: "Build a portfolio website for a photographer",
  taskapp: "Create a task management app",
  weather: "Build a weather dashboard",
  landing: "Create a landing page for a SaaS product",
  quiz: "Build a quiz/trivia app",
};

export const E2E_PROMPT_KEYS = Object.keys(E2E_PROMPTS);

export function getTestPrompt(key: string): string | undefined {
  return E2E_PROMPTS[key];
}
