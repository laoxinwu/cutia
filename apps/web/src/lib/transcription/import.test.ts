import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { EditorCore } from "@/core";
import { storageService } from "@/services/storage/service";
import * as tts from "@/lib/tts/service";
import { importCaptions } from "./import";

const previousWindow = globalThis.window;
let editor: EditorCore;
let speech: ReturnType<typeof spyOn<typeof tts, "generateSpeechFromText">>;
let save: ReturnType<typeof spyOn<typeof storageService, "saveMediaAsset">>;
let remove: ReturnType<typeof spyOn<typeof storageService, "deleteMediaAsset">>;

beforeEach(() => {
	Object.assign(globalThis, { window: globalThis });
	EditorCore.reset();
	editor = EditorCore.getInstance();
	editor.save.stop();
	const scene = {
		id: "scene",
		name: "Scene",
		isMain: true,
		tracks: [],
		bookmarks: [],
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	editor.project.setActiveProject({
		project: {
			metadata: {
				id: "project",
				name: "Project",
				duration: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			scenes: [scene],
			currentSceneId: scene.id,
			settings: {
				fps: 30,
				canvasSize: { width: 1920, height: 1080 },
				background: { type: "color", color: "#000000" },
			},
			version: 3,
		},
	});
	editor.scenes.setScenes({ scenes: [scene], activeSceneId: scene.id });
	speech = spyOn(tts, "generateSpeechFromText").mockRejectedValue(
		new Error("Unexpected speech request"),
	);
	save = spyOn(storageService, "saveMediaAsset").mockResolvedValue();
	remove = spyOn(storageService, "deleteMediaAsset").mockResolvedValue();
});

afterEach(() => {
	for (const asset of editor.media.getAssets()) {
		if (asset.url) URL.revokeObjectURL(asset.url);
	}
	speech.mockRestore();
	save.mockRestore();
	remove.mockRestore();
	EditorCore.reset();
	Object.assign(globalThis, { window: previousWindow });
});

const options = () => ({
	editor,
	text: "  第一行  \r\n\r\n 第二行 \r第三行\n ",
	templateId: "classic",
	generateSpeech: false,
	startTime: 4,
});

test("imports non-empty lines consecutively without a video or speech", async () => {
	await importCaptions(options());
	expect(editor.timeline.getTracks()).toHaveLength(1);
	expect(editor.timeline.getTracks()[0].elements).toMatchObject([
		{ content: "第一行", startTime: 4, duration: 5 },
		{ content: "第二行", startTime: 9, duration: 5 },
		{ content: "第三行", startTime: 14, duration: 5 },
	]);
	expect(speech).not.toHaveBeenCalled();
});

test("aligns every caption with its speech and undoes the whole import", async () => {
	let completed = 0;
	speech.mockImplementation(async () => {
		expect(editor.timeline.getTracks()).toHaveLength(0);
		return {
			duration: [1.25, 2.5, 0.75][completed++],
			buffer: {} as AudioBuffer,
			blob: new Blob(["audio"], { type: "audio/mpeg" }),
		};
	});
	await importCaptions({ ...options(), generateSpeech: true });
	const tracks = editor.timeline.getTracks();
	expect(tracks.map(({ type }) => type)).toEqual(["text", "audio"]);
	for (const track of tracks) {
		expect(track.elements).toMatchObject([
			{ startTime: 4, duration: 1.25, trimStart: 0, trimEnd: 0 },
			{ startTime: 5.25, duration: 2.5, trimStart: 0, trimEnd: 0 },
			{ startTime: 7.75, duration: 0.75, trimStart: 0, trimEnd: 0 },
		]);
	}
	expect(speech.mock.calls.map(([{ text }]) => text)).toEqual([
		"第一行",
		"第二行",
		"第三行",
	]);
	expect(editor.media.getAssets()).toHaveLength(3);
	editor.command.undo();
	expect(editor.timeline.getTracks()).toEqual([]);
	expect(editor.media.getAssets()).toEqual([]);
	editor.command.redo();
	expect(editor.timeline.getTracks()).toEqual(tracks);
	expect(editor.media.getAssets()).toHaveLength(3);
});

test("validates all speech lines before generating or changing the timeline", async () => {
	await expect(
		importCaptions({ ...options(), text: " \n\r\n" }),
	).rejects.toThrow();
	await expect(
		importCaptions({
			...options(),
			text: `valid\n${"字".repeat(2001)}`,
			generateSpeech: true,
		}),
	).rejects.toThrow();
	expect(speech).not.toHaveBeenCalled();
	expect(editor.timeline.getTracks()).toEqual([]);
	expect(editor.command.canUndo()).toBe(false);
});

test("leaves no partial import when speech generation fails", async () => {
	speech.mockResolvedValueOnce({
		duration: 1,
		buffer: {} as AudioBuffer,
		blob: new Blob(["audio"], { type: "audio/mpeg" }),
	});
	await expect(
		importCaptions({ ...options(), generateSpeech: true }),
	).rejects.toThrow("Unexpected speech request");
	expect(editor.timeline.getTracks()).toEqual([]);
	expect(editor.media.getAssets()).toEqual([]);
	expect(editor.command.canUndo()).toBe(false);
});

test("does not insert into another scene if the scene changes during generation", async () => {
	speech.mockImplementation(async () => {
		const scene = { ...editor.scenes.getActiveScene(), id: "another-scene" };
		editor.scenes.setScenes({ scenes: [scene], activeSceneId: scene.id });
		return {
			duration: 1,
			buffer: {} as AudioBuffer,
			blob: new Blob(["audio"], { type: "audio/mpeg" }),
		};
	});
	await expect(
		importCaptions({ ...options(), generateSpeech: true }),
	).rejects.toThrow();
	expect(editor.timeline.getTracks()).toEqual([]);
	expect(editor.media.getAssets()).toEqual([]);
});
