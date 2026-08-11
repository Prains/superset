import { requireNativeView } from "expo";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { NativeSyntheticEvent } from "react-native";
import { withUniwind } from "uniwind";
import type {
	ComposerBarHandle,
	ComposerBarProps,
	ComposerQuickKey,
} from "./ComposerBar.types";

interface NativeComposerRef {
	focusInput: () => Promise<void>;
	blurInput: () => Promise<void>;
	clearText: () => Promise<void>;
}

type NativeComposerProps = {
	placeholder?: string;
	autoFocus?: boolean;
	quickKeys?: ComposerQuickKey[];
	onSubmitText?: (event: NativeSyntheticEvent<{ text: string }>) => void;
	onChangeText?: (event: NativeSyntheticEvent<{ text: string }>) => void;
	onFocusChange?: (event: NativeSyntheticEvent<{ focused: boolean }>) => void;
	onQuickKey?: (event: NativeSyntheticEvent<{ id: string }>) => void;
	onBarMetrics?: (
		event: NativeSyntheticEvent<{ occludedHeight: number }>,
	) => void;
	style?: ComposerBarProps["style"];
	ref?: React.Ref<NativeComposerRef>;
};

const NativeView = withUniwind(
	requireNativeView("Composer") as React.ComponentType<
		NativeComposerProps & { className?: string }
	>,
);

/**
 * Native input bar: UIKit owns the text field, the glass pill, and keyboard
 * tracking (`keyboardLayoutGuide`, including interactive dismiss). Mount it
 * absolutely over the screen — touches outside the bar pass through.
 */
export const ComposerBar = forwardRef<ComposerBarHandle, ComposerBarProps>(
	function ComposerBar(
		{
			onSubmitText,
			onChangeText,
			onFocusChange,
			onQuickKey,
			onBarMetrics,
			style,
			...props
		},
		ref,
	) {
		const nativeRef = useRef<NativeComposerRef>(null);
		useImperativeHandle(ref, () => ({
			focusInput: async () => nativeRef.current?.focusInput(),
			blurInput: async () => nativeRef.current?.blurInput(),
			clearText: async () => nativeRef.current?.clearText(),
		}));

		return (
			<NativeView
				{...props}
				ref={nativeRef}
				className="absolute inset-0"
				style={style}
				onSubmitText={(event) => onSubmitText?.(event.nativeEvent.text)}
				onChangeText={(event) => onChangeText?.(event.nativeEvent.text)}
				onFocusChange={(event) => onFocusChange?.(event.nativeEvent.focused)}
				onQuickKey={(event) => onQuickKey?.(event.nativeEvent.id)}
				onBarMetrics={(event) =>
					onBarMetrics?.(event.nativeEvent.occludedHeight)
				}
			/>
		);
	},
);
