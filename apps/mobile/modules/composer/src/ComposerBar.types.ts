import type { StyleProp, ViewStyle } from "react-native";

export interface ComposerQuickKey {
	id: string;
	/** Monospaced text label; ignored when `symbol` is set. */
	label?: string;
	/** SF Symbol name (e.g. "arrow.up", "escape"). */
	symbol?: string;
}

export interface ComposerBarHandle {
	focusInput: () => Promise<void>;
	blurInput: () => Promise<void>;
	clearText: () => Promise<void>;
}

export interface ComposerBarProps {
	placeholder?: string;
	autoFocus?: boolean;
	quickKeys?: ComposerQuickKey[];
	onSubmitText?: (text: string) => void;
	onChangeText?: (text: string) => void;
	onFocusChange?: (focused: boolean) => void;
	onQuickKey?: (id: string) => void;
	/**
	 * Height (screen-bottom up) covered by the bar + keyboard. Pad scrollable
	 * content with this so nothing hides behind the composer.
	 */
	onBarMetrics?: (occludedHeight: number) => void;
	style?: StyleProp<ViewStyle>;
}
