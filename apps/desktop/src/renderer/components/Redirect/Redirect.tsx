import {
	type NavigateOptions,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Loop-proof declarative redirect. TanStack's <Navigate> re-navigates
 * whenever its props OBJECT IDENTITY changes, so an inline element
 * re-navigates on every parent re-render until React throws error #185
 * (#5729, SUPER-1814). This keys off the resolved target href instead:
 * one navigation per distinct destination, safe to render inline with
 * dynamic params/search. Prefer `beforeLoad: () => { throw redirect(...) }`
 * when the target is static — that avoids render-time navigation entirely.
 */
export function Redirect(props: NavigateOptions) {
	const router = useRouter();
	const navigate = useNavigate();
	const href = router.buildLocation(props).href;
	const propsRef = useRef(props);
	propsRef.current = props;
	const lastHrefRef = useRef<string | null>(null);

	useEffect(() => {
		if (lastHrefRef.current === href) return;
		lastHrefRef.current = href;
		void navigate(propsRef.current);
	}, [href, navigate]);

	return null;
}
