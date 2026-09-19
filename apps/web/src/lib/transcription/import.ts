import type { EditorCore } from "@/core";
import {
	createSubtitleFromTemplate,
	SUBTITLE_TEMPLATES,
} from "@/constants/subtitle-constants";
import { FONT_SIZE_SCALE_REFERENCE } from "@/constants/text-constants";
import {
	AddMediaAssetCommand,
	AddTrackCommand,
	BatchCommand,
	type Command,
	InsertElementCommand,
} from "@/lib/commands";
import { i18next } from "@/lib/i18n";
import { buildUploadAudioElement } from "@/lib/timeline/element-utils";
import { generateSpeechFromText, type TtsResult } from "@/lib/tts/service";

export function parseCaptionLines({ text }: { text: string }): string[] {
	return text
		.split(/\r\n?|\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export async function importCaptions({
	editor,
	text,
	secondaryText = "",
	templateId,
	generateSpeech,
	startTime,
	onProgress,
}: {
	editor: EditorCore;
	text: string;
	secondaryText?: string;
	templateId: string;
	generateSpeech: boolean;
	startTime: number;
	onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
	const lines = parseCaptionLines({ text });
	const secondaryLines = parseCaptionLines({ text: secondaryText });
	if (lines.length === 0) {
		throw new Error(i18next.t("Enter at least one line of subtitles"));
	}
	if (secondaryLines.length > 0 && secondaryLines.length !== lines.length) {
		throw new Error(
			i18next.t(
				"Primary has {{primary}} lines but secondary has {{secondary}}. They must match line by line.",
				{ primary: lines.length, secondary: secondaryLines.length },
			),
		);
	}
	if (generateSpeech && lines.some((line) => line.length > 2000)) {
		throw new Error(
			i18next.t(
				"Each subtitle line must be 2000 characters or fewer for speech",
			),
		);
	}
	const projectId = editor.project.getActive().metadata.id;
	const sceneId = editor.scenes.getActiveScene().id;
	const speechResults: TtsResult[] = [];
	if (generateSpeech) {
		for (const line of lines) {
			onProgress?.(speechResults.length, lines.length);
			const result = await generateSpeechFromText({ text: line });
			if (
				editor.project.getActiveOrNull()?.metadata.id !== projectId ||
				editor.scenes.getActiveScene().id !== sceneId
			) {
				throw new Error(
					i18next.t(
						"The active project or scene changed. Please import again.",
					),
				);
			}
			if (!Number.isFinite(result.duration) || result.duration <= 0) {
				throw new Error(i18next.t("Speech generation returned invalid audio"));
			}
			speechResults.push(result);
		}
		onProgress?.(lines.length, lines.length);
	}

	const template =
		SUBTITLE_TEMPLATES.find((item) => item.templateId === templateId) ??
		SUBTITLE_TEMPLATES[0];
	// Secondary is added first so the primary track ends up above it at index 0
	const secondaryTrack =
		secondaryLines.length > 0 ? new AddTrackCommand("text", 0) : null;
	const captionTrack = new AddTrackCommand("text", 0);
	const audioTrack = generateSpeech ? new AddTrackCommand("audio") : null;
	const commands: Command[] = [];
	if (secondaryTrack) commands.push(secondaryTrack);
	commands.push(captionTrack);
	if (audioTrack) commands.push(audioTrack);
	const secondaryFontSize = Math.max(template.fontSize - 1, 1);
	const { height: canvasHeight } = editor.project.getActive().settings.canvasSize;
	// Centers sit half of each line height apart (renderer uses 1.3 line height)
	const secondaryOffsetY =
		(canvasHeight / FONT_SIZE_SCALE_REFERENCE) *
		1.3 *
		((template.fontSize + secondaryFontSize) / 2);
	let nextStartTime = startTime;
	for (const [index, line] of lines.entries()) {
		const caption = createSubtitleFromTemplate({
			template,
			startTime: nextStartTime,
		});
		const speech = speechResults[index];
		if (speech && audioTrack) {
			const name = `TTS: ${line.slice(0, 30)}`;
			const media = new AddMediaAssetCommand(projectId, {
				name,
				type: "audio",
				file: new File([speech.blob], `${name}.mp3`, { type: "audio/mpeg" }),
				url: URL.createObjectURL(speech.blob),
				duration: speech.duration,
				ephemeral: true,
			});
			commands.push(
				media,
				new InsertElementCommand({
					placement: { mode: "explicit", trackId: audioTrack.getTrackId() },
					element: buildUploadAudioElement({
						mediaId: media.getAssetId(),
						name,
						duration: speech.duration,
						startTime: nextStartTime,
						buffer: speech.buffer,
					}),
				}),
			);
			caption.duration = speech.duration;
		}
		commands.push(
			new InsertElementCommand({
				placement: { mode: "explicit", trackId: captionTrack.getTrackId() },
				element: { ...caption, name: `Caption ${index + 1}`, content: line },
			}),
		);
		if (secondaryTrack) {
			commands.push(
				new InsertElementCommand({
					placement: { mode: "explicit", trackId: secondaryTrack.getTrackId() },
					element: {
						...caption,
						name: `Caption ${index + 1} (secondary)`,
						content: secondaryLines[index],
						fontSize: secondaryFontSize,
						transform: {
							...caption.transform,
							position: {
								...caption.transform.position,
								y: caption.transform.position.y + secondaryOffsetY,
							},
						},
					},
				}),
			);
		}
		nextStartTime += caption.duration;
	}
	editor.command.execute({ command: new BatchCommand(commands) });
}
