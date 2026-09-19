import { expect, test } from "bun:test";
import { getElementHalfSize } from "./element-bounds";
import type { MediaAsset } from "@/types/assets";
import type { ImageElement, TextElement } from "@/types/timeline";

// canvasHeight 900 -> scale factor 10, so fontSize 10 renders at 100px
const CANVAS_HEIGHT = 900;
const mediaMap = new Map<string, MediaAsset>();

// CJK glyphs are 1em wide, everything else 0.5em
const fakeContext = {
	font: "",
	measureText(text: string) {
		const fontSize = Number(/([\d.]+)px/.exec(this.font)?.[1]);
		const width = Array.from(text).reduce(
			(sum, char) =>
				sum + (/[一-鿿]/.test(char) ? fontSize : fontSize / 2),
			0,
		);
		return { width };
	},
};
globalThis.document = {
	createElement: () => ({ getContext: () => fakeContext }),
} as unknown as Document;

function buildText(overrides: Partial<TextElement>) {
	const transform = { scale: 1, position: { x: 0, y: 0 }, rotate: 0 };
	return {
		type: "text",
		name: "Text",
		fontSize: 10,
		fontFamily: "Arial",
		fontWeight: "normal",
		fontStyle: "normal",
		transform,
		...overrides,
	} as TextElement;
}

test("measures single-line text width instead of guessing per character", () => {
	const element = buildText({ content: "像UP主" });

	expect(
		getElementHalfSize({
			element,
			transform: element.transform,
			mediaMap,
			canvasWidth: 1600,
			canvasHeight: CANVAS_HEIGHT,
		}),
	).toEqual({ halfWidth: 150, halfHeight: 70 });
});

test("counts wrapped lines the same way the renderer does", () => {
	const element = buildText({ content: "像像像像像", boxWidth: 25 });

	expect(
		getElementHalfSize({
			element,
			transform: element.transform,
			mediaMap,
			canvasWidth: 1600,
			canvasHeight: CANVAS_HEIGHT,
		}),
	).toEqual({ halfWidth: 125, halfHeight: 195 });
});

test("keeps media bounds fitted to the original canvas", () => {
	const transform = {
		scale: 1,
		position: { x: 0, y: 0 },
		rotate: 0,
	};
	const element = {
		type: "image",
		mediaId: "media",
		transform,
	} as ImageElement;
	const mediaMap = new Map([
		["media", { width: 1920, height: 1080 } as MediaAsset],
	]);

	expect(
		getElementHalfSize({
			element,
			transform,
			mediaMap,
			canvasWidth: 1366,
			canvasHeight: 768,
			fitCanvasSize: { width: 1920, height: 1080 },
		}),
	).toEqual({ halfWidth: 960, halfHeight: 540 });
});
