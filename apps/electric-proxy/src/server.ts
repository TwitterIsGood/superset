import handler from "./index";

const PORT = Number(process.env.PORT || 8787);

const env = {
	AUTH_URL: process.env.AUTH_URL ?? "http://localhost:43001",
	AUTH_JWKS_URL: process.env.AUTH_JWKS_URL,
	ELECTRIC_SHAPE_URL: process.env.ELECTRIC_SHAPE_URL,
	ELECTRIC_SECRET: process.env.ELECTRIC_SECRET,
	ELECTRIC_SOURCE_ID: process.env.ELECTRIC_SOURCE_ID,
	ELECTRIC_SOURCE_SECRET: process.env.ELECTRIC_SOURCE_SECRET,
};

const _server = Bun.serve({
	port: PORT,
	hostname: "0.0.0.0",
	async fetch(request: Request): Promise<Response> {
		return handler.fetch(request, env);
	},
});

console.log(`electric-proxy listening on :${PORT}`);
