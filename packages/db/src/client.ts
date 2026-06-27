import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "./env";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

const pool = new Pool({
	connectionString: env.DATABASE_URL || undefined,
});

const postgresDb = drizzle({
	client: pool,
	schema,
	casing: "snake_case",
});

export const db = postgresDb;
export const dbWs = postgresDb;
