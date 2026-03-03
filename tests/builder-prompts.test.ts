import { describe, it, expect } from "vitest";
import {
  getBuilderPromptForMode,
  WEBSITE_BUILDER_PROMPT,
  REACT_BUILDER_PROMPT,
  PYTHON_BUILDER_PROMPT,
  NODE_BUILDER_PROMPT,
  BUILDER_SYSTEM_PROMPT,
} from "../src/prompts/builder.js";

describe("Builder prompts (M4)", () => {
  describe("getBuilderPromptForMode", () => {
    it("returns WEBSITE_BUILDER_PROMPT for website mode", () => {
      const prompt = getBuilderPromptForMode("website");
      expect(prompt).toBe(WEBSITE_BUILDER_PROMPT);
      expect(prompt).toContain("Tech Stack Rules");
      expect(prompt).toContain("index.html");
      expect(prompt).toContain("create_project");
      expect(prompt).toContain("Performance (Judges evaluate");
    });

    it("returns WEBSITE_BUILDER_PROMPT for web-app mode", () => {
      const prompt = getBuilderPromptForMode("web-app");
      expect(prompt).toBe(WEBSITE_BUILDER_PROMPT);
    });

    it("returns REACT_BUILDER_PROMPT for react-app mode", () => {
      const prompt = getBuilderPromptForMode("react-app");
      expect(prompt).toBe(REACT_BUILDER_PROMPT);
      expect(prompt).toContain("React");
      expect(prompt).toContain("ReactDOM.createRoot");
      expect(prompt).toContain("type=\"text/babel\"");
      expect(prompt).toContain("unpkg.com/react@18");
      expect(prompt).toContain("create_project");
    });

    it("returns PYTHON_BUILDER_PROMPT for python mode", () => {
      const prompt = getBuilderPromptForMode("python");
      expect(prompt).toBe(PYTHON_BUILDER_PROMPT);
      expect(prompt).toContain("Python");
      expect(prompt).toContain("requirements.txt");
      expect(prompt).toContain("if __name__");
      expect(prompt).toContain("PEP 8");
      expect(prompt).toContain("create_project");
    });

    it("returns NODE_BUILDER_PROMPT for node mode", () => {
      const prompt = getBuilderPromptForMode("node");
      expect(prompt).toBe(NODE_BUILDER_PROMPT);
      expect(prompt).toContain("Node.js");
      expect(prompt).toContain("package.json");
      expect(prompt).toContain("type\": \"module\"");
      expect(prompt).toContain("create_project");
    });

    it("throws for text mode (no files — use TEXT_RESPONSE_SYSTEM_PROMPT)", () => {
      expect(() => getBuilderPromptForMode("text")).toThrow(
        /text.*no files|TEXT_RESPONSE_SYSTEM_PROMPT/
      );
    });
  });

  describe("backward compatibility", () => {
    it("BUILDER_SYSTEM_PROMPT equals WEBSITE_BUILDER_PROMPT", () => {
      expect(BUILDER_SYSTEM_PROMPT).toBe(WEBSITE_BUILDER_PROMPT);
    });
  });

  describe("prompt content sanity", () => {
    it("website prompt includes PERFORMANCE_RULES and create_project instructions", () => {
      expect(WEBSITE_BUILDER_PROMPT).toContain("Performance (Judges evaluate site load speed)");
      expect(WEBSITE_BUILDER_PROMPT).toContain("How to Submit Your Work");
      expect(WEBSITE_BUILDER_PROMPT).toContain("create_project");
    });

    it("react prompt requires inline script and createRoot", () => {
      expect(REACT_BUILDER_PROMPT).toMatch(/inline.*script.*text\/babel|script type=.text\/babel/);
      expect(REACT_BUILDER_PROMPT).toContain("ReactDOM.createRoot");
      // Prompt explicitly says NOT to use deprecated ReactDOM.render()
      expect(REACT_BUILDER_PROMPT).toMatch(/deprecated.*ReactDOM\.render|NOT.*ReactDOM\.render/);
    });

    it("python prompt includes requirements and __main__ guard", () => {
      expect(PYTHON_BUILDER_PROMPT).toContain("requirements.txt");
      expect(PYTHON_BUILDER_PROMPT).toContain("__name__");
    });

    it("node prompt includes ES modules and package.json", () => {
      expect(NODE_BUILDER_PROMPT).toContain("type\": \"module\"");
      expect(NODE_BUILDER_PROMPT).toContain("package.json");
    });
  });
});
