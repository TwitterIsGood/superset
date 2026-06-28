import type { ReactNode } from "react";
import { DndProvider } from "react-dnd";
import { dragDropManager } from "renderer/lib/dnd";

interface ReactDndBoundaryProps {
	children: ReactNode;
}

export function ReactDndBoundary({ children }: ReactDndBoundaryProps) {
	return <DndProvider manager={dragDropManager}>{children}</DndProvider>;
}
