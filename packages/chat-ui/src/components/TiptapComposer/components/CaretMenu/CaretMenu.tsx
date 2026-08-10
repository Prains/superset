"use client";

import {
	autoUpdate,
	flip,
	offset,
	shift,
	useFloating,
} from "@floating-ui/react-dom";
import { type ReactNode, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export type CaretMenuProps = {
	rect: { left: number; top: number; bottom: number };
	children: ReactNode;
};

export function CaretMenu({ rect, children }: CaretMenuProps) {
	const { refs, floatingStyles } = useFloating({
		placement: "top-start",
		middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

	useLayoutEffect(() => {
		refs.setReference({
			getBoundingClientRect: () =>
				new DOMRect(rect.left, rect.top, 0, rect.bottom - rect.top),
		});
	}, [rect, refs]);

	return createPortal(
		<div ref={refs.setFloating} style={floatingStyles} className="z-50">
			{children}
		</div>,
		document.body,
	);
}
