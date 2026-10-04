import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const layer = (name) => ({
  group: [`**/${name}/**`],
  message: `This layer must not import from ${name} (see ARCHITECTURE.md).`,
});

const framework = (name) => ({
  name,
  message: `This layer must not depend on ${name} (see ARCHITECTURE.md).`,
});

const restrictImports = (layers, frameworks = []) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: [...layers.map(layer), { group: ["**/container.js"] }],
      paths: frameworks.map(framework),
    },
  ],
});

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/domain/**"],
    rules: restrictImports(
      ["application", "infrastructure", "presentation"],
      ["express", "mongoose"],
    ),
  },
  {
    files: ["src/application/**"],
    rules: restrictImports(
      ["infrastructure", "presentation"],
      ["express", "mongoose"],
    ),
  },
  {
    files: ["src/infrastructure/**"],
    rules: restrictImports(["application", "presentation"], ["express"]),
  },
  {
    files: ["src/presentation/**"],
    rules: restrictImports(["infrastructure"], ["mongoose"]),
  },
  {
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  prettier,
);
