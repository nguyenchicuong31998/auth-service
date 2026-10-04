export const nullableString = (extra: Record<string, unknown> = {}) => ({
  type: "string",
  nullable: true,
  ...extra,
});

export const ref = (schemaName: string) => ({
  $ref: `#/components/schemas/${schemaName}`,
});

export const errorResponse = (
  description: string,
  examples: Record<string, string>,
) => ({
  description,
  content: {
    "application/json": {
      schema: ref("Error"),
      examples: Object.fromEntries(
        Object.entries(examples).map(([name, message]) => [
          name,
          { value: { message } },
        ]),
      ),
    },
  },
});

export const jsonResponse = (
  description: string,
  schemaName: string,
  example: unknown,
  isArray = false,
) => ({
  description,
  content: {
    "application/json": {
      schema: isArray
        ? { type: "array", items: ref(schemaName) }
        : ref(schemaName),
      example,
    },
  },
});

export const jsonBody = (
  schemaName: string,
  examples: Record<string, { summary: string; value: unknown }>,
) => ({
  required: true,
  content: {
    "application/json": { schema: ref(schemaName), examples },
  },
});

export const uuidPathParam = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string", format: "uuid" },
});
