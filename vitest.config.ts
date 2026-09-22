import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // `include` is rooted at `frontend/`, so without this it also collects
    // test copies out of sibling worktrees checked out under
    // `.claude/worktrees/` — another branch's tests reported as this one's.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
