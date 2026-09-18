import type { EditorCore } from "@/core";
import {
	createSubtitleFromTemplate,
	SUBTITLE_TEMPLATES,
} from "@/constants/subtitle-constants";
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

export async function importCaptions({
	editor,
	text,
	templateId,
	generateSpeech,
	startTime,
	onProgress,
}: {
	editor: EditorCore;
	text: string;
	templateId: string;
	generateSpeech: boolean;
	startTime: number;
	onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
	const lines = text
		.split(/\r\n?|\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) {
		throw new Error(i18next.t("Enter at least one line of subtitles"));
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
	const captionTrack = new AddTrackCommand("text", 0);
	const audioTrack = generateSpeech ? new AddTrackCommand("audio") : null;
	const commands: Command[] = [captionTrack];
	if (audioTrack) commands.push(audioTrack);
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
		nextStartTime += caption.duration;
	}
	editor.command.execute({ command: new BatchCommand(commands) });
}
