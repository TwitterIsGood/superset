import { modelProxyDaemonManager } from "main/lib/model-proxy-daemon/manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { aggregateModels } from "./aggregation";
import {
	fetchProviderModels,
	fetchProviderModelsFromDraft,
	testProvider,
} from "./service";
import {
	deleteProvider,
	listProvidersForProxy,
	listStoredProviders,
	replaceProviderModels,
	upsertProvider,
} from "./storage";
import {
	readWorkspaceModelSettings,
	saveProjectModelSettings,
} from "./workspace-settings";

const protocolSchema = z.union([z.literal("anthropic"), z.literal("openai")]);
const fetchDraftModelsInputSchema = z.object({
	id: z.string().optional(),
	protocol: protocolSchema,
	baseUrl: z.string().min(1),
	proxyUrl: z.string().optional(),
	secret: z.string().optional(),
});
const providerInputSchema = z.object({
	id: z.string().optional(),
	name: z.string().min(1),
	protocol: protocolSchema,
	baseUrl: z.string().min(1),
	proxyUrl: z.string().optional(),
	enabled: z.boolean(),
	secret: z.string().optional(),
	models: z.array(z.string()).optional(),
});

export const createModelProvidersRouter = () =>
	router({
		list: publicProcedure.query(() => listStoredProviders()),
		create: publicProcedure
			.input(providerInputSchema)
			.mutation(({ input }) => upsertProvider(input)),
		update: publicProcedure
			.input(providerInputSchema.extend({ id: z.string() }))
			.mutation(({ input }) => upsertProvider(input)),
		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => deleteProvider(input.id)),
		test: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => testProvider(input.id)),
		fetchModels: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const models = await fetchProviderModels(input.id);
				return replaceProviderModels(input.id, models);
			}),
		fetchModelsFromDraft: publicProcedure
			.input(fetchDraftModelsInputSchema)
			.mutation(({ input }) => fetchProviderModelsFromDraft(input)),
		listAggregatedModels: publicProcedure.query(async () => {
			const providers = await listProvidersForProxy();
			return aggregateModels(
				providers.map((provider) => ({
					...provider,
					hasSecret: !!provider.secret,
				})),
			);
		}),
	});

export const createModelProxyRouter = () =>
	router({
		status: publicProcedure.query(() => modelProxyDaemonManager.status()),
		restart: publicProcedure.mutation(() => modelProxyDaemonManager.restart()),
	});

export const createWorkspaceModelSettingsRouter = () =>
	router({
		read: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => readWorkspaceModelSettings(input.workspaceId)),
		save: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					haikuModel: z.string().min(1),
					sonnetModel: z.string().min(1),
					opusModel: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const status = await modelProxyDaemonManager.ensureRunning();
				if (!status.baseUrl) {
					throw new Error(
						`Model proxy is not available (${status.statusCode})${status.lastError ? `: ${status.lastError}` : ""}`,
					);
				}
				return saveProjectModelSettings({
					...input,
					baseUrl: status.baseUrl,
					token: modelProxyDaemonManager.getWorkspaceToken(),
				});
			}),
	});
