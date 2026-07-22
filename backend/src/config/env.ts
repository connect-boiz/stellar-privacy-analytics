import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  API_HOST: Joi.string().default("localhost"),
  API_PORT: Joi.number().integer().positive().default(3001),
  REDIS_URL: Joi.string()
    .uri()
    .required()
    .messages({
      "any.required": "REDIS_URL is required. Format: redis[s]://[user:password@]host:port[/db]",
      "string.uri": "REDIS_URL must be a valid URI. Format: redis[s]://[user:password@]host:port[/db]",
    }),
  DB_HOST: Joi.string().default("localhost"),
  DB_PORT: Joi.number().integer().positive().default(5432),
  DB_NAME: Joi.string().default("stellar_privacy"),
  DB_USER: Joi.string().default("postgres"),
  DB_PASSWORD: Joi.string().allow("").default("postgres"),
  CORS_ORIGINS: Joi.string().default(
    "http://localhost:3000,http://localhost:3001",
  ),
}).unknown(true);

const { value, error } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
  stripUnknown: false,
});

if (error) {
  const details = error.details.map((detail) => detail.message).join(", ");
  throw new Error(`Environment validation failed: ${details}`);
}

Object.entries(value).forEach(([key, rawValue]) => {
  if (rawValue === undefined || rawValue === null) {
    return;
  }

  if (process.env[key] === undefined) {
    process.env[key] = String(rawValue);
  }
});

export const env = value;
