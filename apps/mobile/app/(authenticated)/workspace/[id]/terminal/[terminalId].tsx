import { Redirect, useLocalSearchParams } from "expo-router";

// Terminal deep links resolve into the workspace shell with the tab active.
export default function TerminalRedirect() {
	const { id, terminalId } = useLocalSearchParams<{
		id: string;
		terminalId: string;
	}>();
	return (
		<Redirect href={`/(authenticated)/workspace/${id}?tab=${terminalId}`} />
	);
}
