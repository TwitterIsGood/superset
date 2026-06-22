import { useControlChatStore } from "renderer/stores/control-chat";
import { ControlChatFab } from "./components/ControlChatFab";
import { ControlChatWindow } from "./components/ControlChatWindow";

export function ControlChatHost() {
	const isOpen = useControlChatStore((state) => state.isOpen);
	const toggleOpen = useControlChatStore((state) => state.toggleOpen);

	return (
		<>
			{isOpen && <ControlChatWindow />}
			<ControlChatFab isOpen={isOpen} onClick={toggleOpen} />
		</>
	);
}
