import { describe, expect, test } from "bun:test";
import { isEnvironmentUpdateError } from "./update-error-classification";

const GIGABYTE = 1024 * 1024 * 1024;
const FULL_VOLUME = 40 * 1024 * 1024;
const ROOMY_VOLUME = 60 * GIGABYTE;

// Captured from production, with the account name and archive digest replaced.
const DITTO_NO_SPACE_EN = [
	"ditto: /Users/<user>/Library/Caches/com.superset.desktop.ShipIt/update.aBcDeF1/Superset.app/Contents/Resources/app.asar: No space left on device",
	"ditto: Couldn't read pkzip signature.",
].join("\n");
const SQUIRREL_NO_SPACE_ES =
	"El archivo “<digest>.zip” no puede guardarse porque no queda suficiente espacio.: No hay suficiente espacio. Elimina algunos archivos del volumen e inténtalo de nuevo.";

const CHECKSUM_MISMATCH =
	"sha512 checksum mismatch, expected 1PbOs3lC, got fT2wPk9d";
const SIGNATURE_FAILURE =
	'Could not get code signature for running application: Error: Command failed: codesign --verify -vvvv "/Applications/Superset.app"';
const FEED_FAILURE =
	"HttpError: 404 Not Found\nCannot parse update info from latest-mac.yml";

describe("isEnvironmentUpdateError", () => {
	test("classifies a full staging volume without reading the message", () => {
		expect(isEnvironmentUpdateError(DITTO_NO_SPACE_EN, FULL_VOLUME)).toBe(true);
		expect(isEnvironmentUpdateError(SQUIRREL_NO_SPACE_ES, FULL_VOLUME)).toBe(
			true,
		);
	});

	test("reports those same failures when the volume has room", () => {
		expect(isEnvironmentUpdateError(DITTO_NO_SPACE_EN, ROOMY_VOLUME)).toBe(
			false,
		);
		expect(isEnvironmentUpdateError(SQUIRREL_NO_SPACE_ES, ROOMY_VOLUME)).toBe(
			false,
		);
	});

	test("reports genuine updater bugs", () => {
		for (const message of [
			CHECKSUM_MISMATCH,
			SIGNATURE_FAILURE,
			FEED_FAILURE,
		]) {
			expect(isEnvironmentUpdateError(message, ROOMY_VOLUME)).toBe(false);
			expect(isEnvironmentUpdateError(message, null)).toBe(false);
		}
	});

	test("suppresses every updater failure while the volume is full", () => {
		expect(isEnvironmentUpdateError(CHECKSUM_MISMATCH, FULL_VOLUME)).toBe(true);
	});

	test("keeps the existing errno and read-only classifications", () => {
		expect(
			isEnvironmentUpdateError(
				"ENOENT: no such file or directory, rename '/Users/<user>/Library/Caches/superset-updater/pending/x.zip'",
				ROOMY_VOLUME,
			),
		).toBe(true);
		expect(
			isEnvironmentUpdateError(
				"Error: Cannot update while running on a read-only volume",
				ROOMY_VOLUME,
			),
		).toBe(true);
		expect(
			isEnvironmentUpdateError(
				"ENOENT: no such file or directory",
				ROOMY_VOLUME,
			),
		).toBe(false);
	});
});
