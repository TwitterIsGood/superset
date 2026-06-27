import type { CSSProperties, MouseEvent, ReactElement, ReactNode } from "react";

export const SONNER_TOASTER_REQUESTED_EVENT =
	"superset:sonner-toaster-requested";

type ToastId = string | number;
type ToastPosition =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "top-center"
	| "bottom-center";
interface ToastAction {
	label: ReactNode;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	actionButtonStyle?: CSSProperties;
}
interface ExternalToast {
	id?: ToastId;
	description?: (() => ReactNode) | ReactNode;
	duration?: number;
	position?: ToastPosition;
	action?: ToastAction | ReactNode;
	cancel?: ToastAction | ReactNode;
	style?: CSSProperties;
	className?: string;
	descriptionClassName?: string;
	unstyled?: boolean;
	closeButton?: boolean;
	dismissible?: boolean;
	[key: string]: unknown;
}
interface PromiseExtendedResult extends ExternalToast {
	message: ReactNode;
}
type PromiseExtendedResultFactory<Data> = (
	data: Data,
) => PromiseExtendedResult | Promise<PromiseExtendedResult>;
type PromiseResult<Data> =
	| string
	| ReactNode
	| ((data: Data) => string | ReactNode | Promise<string | ReactNode>);
type PromiseData<Data> = Omit<ExternalToast, "description"> & {
	id?: ToastId;
	loading?: string | ReactNode;
	success?: PromiseResult<Data> | PromiseExtendedResultFactory<Data>;
	error?: PromiseResult<Error> | PromiseExtendedResultFactory<Error>;
	description?: PromiseResult<Data>;
	finally?: () => void | Promise<void>;
};
type ToastRenderer = (id: ToastId) => ReactElement;
type SonnerToast = typeof import("@superset/ui/sonner").toast;

let sonnerImportPromise: Promise<typeof import("@superset/ui/sonner")> | null =
	null;
let nextLazyToastId = 0;

function createLazyToastId(): ToastId {
	nextLazyToastId += 1;
	return `lazy-toast-${Date.now()}-${nextLazyToastId}`;
}

function requestToaster() {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(new Event(SONNER_TOASTER_REQUESTED_EVENT));
}

function loadSonner() {
	requestToaster();
	sonnerImportPromise ??= import("@superset/ui/sonner");
	return sonnerImportPromise;
}

function runWithToast(callback: (toast: SonnerToast) => void) {
	void loadSonner().then(({ toast }) => callback(toast));
}

function withStableId<T extends { id?: ToastId }>(
	options?: T,
): [ToastId, T & { id: ToastId }] {
	const id = options?.id ?? createLazyToastId();
	return [id, { ...options, id } as T & { id: ToastId }];
}

function showToast(message: ReactNode, options?: ExternalToast): ToastId {
	const [id, stableOptions] = withStableId(options);
	runWithToast((sonnerToast) => {
		sonnerToast(message, stableOptions);
	});
	return id;
}

export const toast = Object.assign(showToast, {
	success(message: ReactNode, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.success(message, stableOptions);
		});
		return id;
	},
	error(message: ReactNode, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.error(message, stableOptions);
		});
		return id;
	},
	warning(message: ReactNode, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.warning(message, stableOptions);
		});
		return id;
	},
	info(message: ReactNode, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.info(message, stableOptions);
		});
		return id;
	},
	message(message: ReactNode, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.message(message, stableOptions);
		});
		return id;
	},
	loading(message: ReactNode, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.loading(message, stableOptions);
		});
		return id;
	},
	custom(renderer: ToastRenderer, options?: ExternalToast): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.custom(renderer, stableOptions);
		});
		return id;
	},
	promise<T>(
		promise: Promise<T> | (() => Promise<T>),
		options?: PromiseData<T>,
	): ToastId {
		const [id, stableOptions] = withStableId(options);
		runWithToast((sonnerToast) => {
			sonnerToast.promise(promise, stableOptions);
		});
		return id;
	},
	dismiss(id?: ToastId): void {
		runWithToast((sonnerToast) => {
			sonnerToast.dismiss(id);
		});
	},
});
