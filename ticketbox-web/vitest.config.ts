import { defineConfig } from "vitest/config";

// Vitest setup for the Next.js app: jsdom gives components a browser-like DOM,
// and coverage is emitted as LCOV so the SonarQube scanner can consume it
// (see -Dsonar.javascript.lcov.reportPaths in ci/jenkins/Jenkinsfile.web).
export default defineConfig({
  // tsconfig sets jsx: "preserve" for Next.js; Vitest needs the automatic
  // runtime so JSX compiles without an explicit React import.
  esbuild: {
    jsx: "automatic"
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"]
    }
  }
});
