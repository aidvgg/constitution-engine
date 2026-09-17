import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  DATABASE_URL: z.url("DATABASE_URL must be a valid URL"),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((err: z.core.$ZodIssue) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(
        `Missing or invalid environment variables:\n${missingVars}`
      );
    }
    throw error;
  }
}

export const env = loadEnv();
