import type { ScopeOption } from "../../TriggerSentence/scopeOption";

/**
 * The reactions a trigger can be scoped to, by Slack short name — what a
 * `reaction_added` event carries. Standard emoji, since there is no API that
 * lists them; workspace custom emoji would need `emoji.list` and its scope.
 */
export const SLACK_REACTION_OPTIONS: ScopeOption[] = [
	["+1", "👍"],
	["-1", "👎"],
	["eyes", "👀"],
	["white_check_mark", "✅"],
	["heavy_check_mark", "✔️"],
	["x", "❌"],
	["bug", "🐛"],
	["fire", "🔥"],
	["rocket", "🚀"],
	["tada", "🎉"],
	["raised_hands", "🙌"],
	["pray", "🙏"],
	["heart", "❤️"],
	["100", "💯"],
	["warning", "⚠️"],
	["rotating_light", "🚨"],
	["question", "❓"],
	["memo", "📝"],
	["pushpin", "📌"],
	["bookmark", "🔖"],
	["mag", "🔍"],
	["wrench", "🔧"],
	["bulb", "💡"],
	["thinking_face", "🤔"],
	["clap", "👏"],
	["wave", "👋"],
	["ok_hand", "👌"],
	["hourglass_flowing_sand", "⏳"],
	["zap", "⚡"],
	["boom", "💥"],
	["sos", "🆘"],
	["robot_face", "🤖"],
	["ship", "🚢"],
].map(([id, glyph]) => ({ id, label: `${glyph} ${id}` }));
