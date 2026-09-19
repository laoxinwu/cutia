import { expect, test } from "bun:test";
import { mergeBoxSelection } from "./use-selection-box";

test("box selection preserves the starting selection without duplicates or drag leftovers", () => {
	const previous = { trackId: "video", elementId: "previous" };
	const added = { trackId: "video", elementId: "added" };
	const otherTrack = { trackId: "audio", elementId: "added" };
	const initialElements = [previous];

	expect(
		mergeBoxSelection({
			initialElements,
			elements: [{ ...previous }, added, otherTrack],
		}),
	).toEqual([previous, added, otherTrack]);
	expect(mergeBoxSelection({ initialElements, elements: [added] })).toEqual([
		previous,
		added,
	]);
	expect(mergeBoxSelection({ initialElements, elements: [] })).toEqual([
		previous,
	]);
	expect(initialElements).toEqual([previous]);
	expect(mergeBoxSelection({ initialElements: [], elements: [added] })).toEqual(
		[added],
	);
	expect(mergeBoxSelection({ initialElements: [], elements: [] })).toEqual([]);
});
