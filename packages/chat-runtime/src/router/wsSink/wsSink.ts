import type { Sink } from "../../stream";

export type WsSinkSocket = {
	send(data: string): void;
	close(): void;
	onclose: (() => void) | null;
};

export function createWsSink(socket: WsSinkSocket): Sink {
	let open = true;
	const previous = socket.onclose;
	socket.onclose = () => {
		open = false;
		previous?.();
	};
	return {
		send(envelope) {
			if (!open) return;
			socket.send(JSON.stringify(envelope));
		},
		close() {
			if (!open) return;
			open = false;
			socket.close();
		},
	};
}
