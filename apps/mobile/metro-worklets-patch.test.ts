import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on metro (patches/README.md). Without it, every cold
// release bundle — `expo export`, and so every EAS build — dies with "Failed to
// get the SHA-1" for a Bundle Mode worklet file. patchedDependencies is keyed to
// an exact version, so bumping metro (an Expo SDK bump will) silently drops the
// patch and the store build breaks again. If this fails after a bump, pull the
// matching patch per patches/README.md; do NOT delete the test.
describe("metro Bundle Mode SHA-1 patch", () => {
	const source = readFileSync(
		join(
			dirname(require.resolve("metro/package.json")),
			"src/node-haste/DependencyGraph.js",
		),
		"utf8",
	);

	test("short-circuits SHA-1 for generated .worklets modules", () => {
		expect(source).toContain('"react-native-worklets"');
		expect(source).toContain('".worklets"');
		expect(source).toMatch(
			/getOrComputeSha1\(mixedPath\)\s*{\s*if \(mixedPath\.includes\(workletsDirPath\)\)/,
		);
	});
});
