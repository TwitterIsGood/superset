import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROTO_PATH = path.resolve(__dirname, "../../proto/idb.proto");

let cachedPackageDef: ReturnType<typeof protoLoader.loadSync> | null = null;
let cachedIdb: any = null;

function loadIdbProto(protoPath?: string): any {
	const resolvedPath = protoPath ?? DEFAULT_PROTO_PATH;
	if (cachedIdb && !protoPath) return cachedIdb;

	const pkgDef = protoLoader.loadSync(resolvedPath, {
		keepCase: true,
		longs: String,
		enums: String,
		defaults: true,
		oneofs: true,
	});
	const idb = grpc.loadPackageDefinition(pkgDef).idb;
	if (!protoPath) {
		cachedPackageDef = pkgDef;
		cachedIdb = idb;
	}
	return idb;
}

export function isIdbAvailable(protoPath?: string): boolean {
	const resolvedPath = protoPath ?? DEFAULT_PROTO_PATH;
	return fs.existsSync(resolvedPath);
}

export function createCompanionClient(port: number, protoPath?: string) {
	const idb = loadIdbProto(protoPath);
	return new (idb as any).CompanionService(
		`localhost:${port}`,
		grpc.credentials.createInsecure(),
		{
			"grpc.max_receive_message_length": 64 * 1024 * 1024,
			"grpc.max_send_message_length": 64 * 1024 * 1024,
		},
	);
}

export function createHidClient(port: number, protoPath?: string) {
	const idb = loadIdbProto(protoPath);
	return new (idb as any).CompanionService(
		`localhost:${port}`,
		grpc.credentials.createInsecure(),
	);
}

export { grpc, loadIdbProto };
