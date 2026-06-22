/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import {
	embeddedFileLabelsFromText,
	stripEmbeddedFilePayloads,
} from "./userMessageDisplay";

describe("userMessageDisplay", () => {
	test("hides embedded file base64 payloads from mobile user bubbles", () => {
		const text = [
			"请读取我上传的文件，回复 file upload ok。",
			"",
			"[File: mobile-upload-ok.txt]",
			"```",
			"bW9iaWxlLXVwbG9hZC1vayBmcm9tIFN1cGVyc2V0",
			"```",
		].join("\n");

		expect(stripEmbeddedFilePayloads(text)).toBe(
			"请读取我上传的文件，回复 file upload ok。",
		);
		expect(embeddedFileLabelsFromText(text)).toEqual(["mobile-upload-ok.txt"]);
	});
});
