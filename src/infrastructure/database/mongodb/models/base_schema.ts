import { v4 as uuidv4, validate as isUuid } from "uuid";

export const uuidField = {
  type: String,
  lowercase: true,
  validate: {
    validator: (value: string | null) => value === null || isUuid(value),
    message: "{PATH} must be a valid UUID",
  },
};

export const uuidIdField = { ...uuidField, default: () => uuidv4() };

export const uuidRefField = { ...uuidField, required: true };

export const nullableDate = { type: Date, default: null };

export const nullableString = { type: String, default: null };

export const schemaOptions = (collection: string) => ({
  collection,
  versionKey: false as const,
  timestamps: { createdAt: true, updatedAt: false },
});
