import { cn } from "@superset/ui/utils";

/**
 * Per-plugin identity tile: the manifest's emoji `icon` when declared,
 * otherwise a two-letter monogram on a hue hashed from the plugin id —
 * distinct rows scan by recognition before reading.
 */
export function PluginTile({
	pluginId,
	name,
	icon,
	size = "md",
	className,
}: {
	pluginId: string;
	name: string;
	icon?: string;
	size?: "md" | "lg";
	className?: string;
}) {
	let hash = 0;
	for (let i = 0; i < pluginId.length; i++) {
		hash = (hash * 31 + pluginId.charCodeAt(i)) | 0;
	}
	const hue = ((hash % 360) + 360) % 360;
	const words = name.split(/\s+/).filter(Boolean);
	const monogram = (
		words.length >= 2
			? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
			: name.slice(0, 2)
	).toUpperCase();

	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded-lg",
				size === "lg" ? "size-14 text-2xl" : "size-9 text-[13px]",
				className,
			)}
			style={{
				background: `hsl(${hue} 28% 20%)`,
				color: `hsl(${hue} 60% 72%)`,
			}}
		>
			{icon ? (
				<span className={size === "lg" ? "text-[26px]" : "text-base"}>
					{icon}
				</span>
			) : (
				<span className="font-mono font-semibold tracking-tight">
					{monogram}
				</span>
			)}
		</div>
	);
}
