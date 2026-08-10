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
	anchor: HTMLElement;
	children: ReactNode;
};

export function CaretMenu({ anchor, children }: CaretMenuProps) {
	const { refs, floatingStyles } = useFloating({
		placement: "top-start",
		middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

	useLayoutEffect(() => {
		refs.setReference(anchor);
	}, [anchor, refs]);

	return createPortal(
		<div ref={refs.setFloating} style={floatingStyles} className="z-50">
			{children}
		</div>,
		document.body,
	);
}
