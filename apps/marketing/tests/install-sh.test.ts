import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `install.sh` is a static asset served from https://superset.sh/cli/install.sh,
// so it can't be imported. Instead we strip its `main "$@"` entrypoint, source
// the remainder, and call `detect_target()` with a stubbed `uname` on PATH.
const REPO_ROOT = join(import.meta.dir, "../../..");
const INSTALL_SH = join(REPO_ROOT, "apps/marketing/public/cli/install.sh");
const RELEASE_WORKFLOW = join(REPO_ROOT, ".github/workflows/release-cli.yml");

const ENTRYPOINT = 'main "$@"';

function buildHarness(): string {
	const source = readFileSync(INSTALL_SH, "utf8");
	if (!source.includes(ENTRYPOINT)) {
		throw new Error(`install.sh no longer ends with \`${ENTRYPOINT}\``);
	}

	const dir = mkdtempSync(join(tmpdir(), "install-sh-test-"));
	const binDir = join(dir, "bin");
	mkdirSync(binDir);

	// Stubbed `uname` — the only external command detect_target() shells out to.
	const uname = join(binDir, "uname");
	writeFileSync(
		uname,
		'#!/bin/sh\ncase "$1" in\n  -s) echo "$FAKE_OS" ;;\n  -m) echo "$FAKE_ARCH" ;;\n  *) exit 1 ;;\nesac\n',
	);
	chmodSync(uname, 0o755);

	const harness = join(dir, "harness.sh");
	writeFileSync(harness, `${source.replace(ENTRYPOINT, "")}\ndetect_target\n`);

	return harness;
}

const HARNESS = buildHarness();
const STUB_BIN = join(HARNESS, "../bin");

function detectTarget(os: string, arch: string) {
	const result = Bun.spawnSync(["sh", HARNESS], {
		env: {
			PATH: `${STUB_BIN}:${process.env.PATH ?? ""}`,
			HOME: process.env.HOME,
			FAKE_OS: os,
			FAKE_ARCH: arch,
		},
	});

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString().trim(),
		stderr: result.stderr.toString().trim(),
	};
}

describe("install.sh detect_target", () => {
	test("resolves Linux x86_64 to linux-x64", () => {
		const result = detectTarget("Linux", "x86_64");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("linux-x64");
	});

	test("resolves macOS arm64 to darwin-arm64", () => {
		const result = detectTarget("Darwin", "arm64");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("darwin-arm64");
	});

	// Regression: https://github.com/superset-sh/superset/issues/6053
	// `superset-linux-arm64.tar.gz` ships on every CLI release and `superset
	// update` resolves arm64, but the installer bailed with "Unsupported Linux
	// architecture: aarch64" on ARM64 hosts.
	test("resolves Linux aarch64 to linux-arm64", () => {
		const result = detectTarget("Linux", "aarch64");
		expect(result.stderr).not.toContain("Unsupported Linux architecture");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("linux-arm64");
	});

	test("resolves Linux arm64 to linux-arm64", () => {
		const result = detectTarget("Linux", "arm64");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("linux-arm64");
	});

	test("rejects Intel Macs with a targeted message", () => {
		const result = detectTarget("Darwin", "x86_64");
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("Intel Macs are not supported");
	});

	test("rejects genuinely unsupported Linux architectures", () => {
		const result = detectTarget("Linux", "riscv64");
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("Unsupported Linux architecture: riscv64");
	});

	test("rejects unsupported operating systems", () => {
		const result = detectTarget("FreeBSD", "x86_64");
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("Unsupported OS: FreeBSD");
	});
});

describe("install.sh covers every published release target", () => {
	// `uname -s`/`uname -m` output that should map to each release target. Keeps
	// the installer honest about the tarballs release-cli.yml actually publishes.
	const UNAME_BY_TARGET: Record<string, [string, string]> = {
		"linux-x64": ["Linux", "x86_64"],
		"linux-arm64": ["Linux", "aarch64"],
		"darwin-arm64": ["Darwin", "arm64"],
	};

	const publishedTargets = [
		...readFileSync(RELEASE_WORKFLOW, "utf8").matchAll(
			/"target"\s*:\s*"([^"]+)"/g,
		),
	].map((match) => match[1] as string);

	test("release-cli.yml declares the targets we expect", () => {
		expect(publishedTargets.length).toBeGreaterThan(0);
		expect(publishedTargets.sort()).toEqual(
			Object.keys(UNAME_BY_TARGET).sort(),
		);
	});

	for (const target of Object.keys(UNAME_BY_TARGET)) {
		test(`detect_target resolves ${target}`, () => {
			const [os, arch] = UNAME_BY_TARGET[target] as [string, string];
			expect(detectTarget(os, arch).stdout).toBe(target);
		});
	}
});
