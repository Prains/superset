import type { CodeViewOptions } from "@pierre/diffs";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useMemo } from "react";
import {
	resolveEditorLineHeight,
	resolveFontVariantLigatures,
} from "renderer/lib/editor-typography";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { DEFAULT_CODE_EDITOR_FONT_SIZE } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/constants";
import {
	DIFF_POOL_RENDER_OPTIONS,
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme, useTerminalTheme } from "renderer/stores/theme";

interface UsePullRequestDiffThemeOptions {
	diffStyle: "split" | "unified";
}

export function usePullRequestDiffTheme({
	diffStyle,
}: UsePullRequestDiffThemeOptions) {
	const activeTheme = useResolvedTheme();
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: FONT_SETTINGS_QUERY_KEY,
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const editorFontSize = Number.isFinite(parsedEditorFontSize)
		? parsedEditorFontSize
		: DEFAULT_CODE_EDITOR_FONT_SIZE;
	const surfaceBg = terminalTheme?.background ?? "var(--background)";

	const style = useMemo(
		() =>
			({
				...getDiffViewerStyle(activeTheme, {
					fontFamily: fontSettings?.editorFontFamily ?? undefined,
					fontSize: editorFontSize,
				}),
				"--diffs-line-height": `${resolveEditorLineHeight(
					editorFontSize,
					fontSettings?.editorLineHeight ?? undefined,
				)}px`,
				fontWeight: fontSettings?.editorFontWeight ?? undefined,
				letterSpacing:
					fontSettings?.editorLetterSpacing == null
						? undefined
						: `${fontSettings.editorLetterSpacing}px`,
				fontVariantLigatures: resolveFontVariantLigatures(
					fontSettings?.editorLigatures ?? undefined,
				),
				backgroundColor: surfaceBg,
			}) as CSSProperties,
		[
			activeTheme,
			fontSettings?.editorFontFamily,
			fontSettings?.editorFontWeight,
			fontSettings?.editorLetterSpacing,
			fontSettings?.editorLigatures,
			fontSettings?.editorLineHeight,
			editorFontSize,
			surfaceBg,
		],
	);

	const options = useMemo<CodeViewOptions<undefined>>(
		() => ({
			diffStyle,
			overflow: "wrap",
			stickyHeaders: true,
			theme: getDiffsTheme(activeTheme),
			themeType: activeTheme.type,
			layout: {
				paddingTop: 0,
				paddingBottom: 8,
				gap: 8,
			},
			...DIFF_POOL_RENDER_OPTIONS,
			tokenizeMaxLength: 200_000,
			unsafeCSS: `
				* { user-select: text; -webkit-user-select: text; }
				/* Pierre sets --diffs-light-bg/--diffs-dark-bg inline on
				 * <pre data-diff> from the Shiki theme; inline beats :host
				 * so we override at the pre. */
				[data-diff] {
					--diffs-light-bg: ${surfaceBg} !important;
					--diffs-dark-bg: ${surfaceBg} !important;
				}
			`,
		}),
		[activeTheme, diffStyle, surfaceBg],
	);

	return { options, style };
}
