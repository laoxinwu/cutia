"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogBody,
	DialogFooter,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useEditor } from "@/hooks/use-editor";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useRevealItem } from "@/hooks/use-reveal-item";
import { processMediaAssets } from "@/lib/media/processing";
import { fetchRemoteMediaAsFile } from "@/lib/media/url-import";
import {
	buildImageElement,
	buildUploadAudioElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import type { MediaAsset } from "@/types/assets";
import type { CreateTimelineElement } from "@/types/timeline";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Video01Icon,
	Link04Icon,
	ComputerIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export function MediaView() {
	const editor = useEditor();
	const mediaFiles = editor.media.getAssets();
	const activeProject = editor.project.getActive();

	const { mediaViewMode, setMediaViewMode, highlightMediaId, clearHighlight } =
		useAssetsPanelStore();
	const { highlightedId, registerElement } = useRevealItem(
		highlightMediaId,
		clearHighlight,
	);

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [sortBy, setSortBy] = useState<"name" | "type" | "duration" | "size">(
		"name",
	);
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

	const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
	const [urlInput, setUrlInput] = useState("");
	const [isUrlImporting, setIsUrlImporting] = useState(false);

	const processFiles = async ({ files }: { files: FileList | File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			const processedAssets = await processMediaAssets({
				files,
				onProgress: (progress: { progress: number }) =>
					setProgress(progress.progress),
			});
			for (const asset of processedAssets) {
				await editor.media.addMediaAsset({
					projectId: activeProject.metadata.id,
					asset,
				});
			}
		} catch (error) {
			console.error("Error processing files:", error);
			toast.error("Failed to process files");
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const handleUrlImport = async () => {
		const trimmedUrl = urlInput.trim();
		if (!trimmedUrl) return;

		try {
			new URL(trimmedUrl);
		} catch {
			toast.error("Please enter a valid URL");
			return;
		}

		setIsUrlImporting(true);
		try {
			const file = await fetchRemoteMediaAsFile({ url: trimmedUrl });
			await processFiles({ files: [file] });
			setIsUrlDialogOpen(false);
			setUrlInput("");
			toast.success("Media imported successfully");
		} catch (error) {
			console.error("Error importing from URL:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to import media from URL",
			);
		} finally {
			setIsUrlImporting(false);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: "image/*,video/*,audio/*",
			multiple: true,
			onFilesSelected: (files) => processFiles({ files }),
		});

	const handleRemove = async ({
		event,
		id,
	}: {
		event: React.MouseEvent;
		id: string;
	}) => {
		event.stopPropagation();

		if (!activeProject) {
			toast.error("No active project");
			return;
		}

		await editor.media.removeMediaAsset({
			projectId: activeProject.metadata.id,
			id,
		});
	};

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: number;
	}): boolean => {
		const element = createElementFromMedia({ asset, startTime });
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
		return true;
	};

	const filteredMediaItems = useMemo(() => {
		const filtered = mediaFiles.filter((item) => !item.ephemeral);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (sortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return sortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return sortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [mediaFiles, sortBy, sortOrder]);

	const previewComponents = useMemo(() => {
		const previews = new Map<string, React.ReactNode>();

		filteredMediaItems.forEach((item) => {
			previews.set(item.id, <MediaPreview item={item} />);
			previews.set(
				`compact-${item.id}`,
				<MediaPreview item={item} variant="compact" />,
			);
		});

		return previews;
	}, [filteredMediaItems]);

	const renderPreview = (item: MediaAsset) => previewComponents.get(item.id);
	const renderCompactPreview = (item: MediaAsset) =>
		previewComponents.get(`compact-${item.id}`);

	return (
		<>
			<input {...fileInputProps} />

			<div
				className={`relative flex h-full flex-col gap-1 ${isDragOver ? "bg-accent/30" : ""}`}
				{...dragProps}
			>
				<div className="bg-background h-12 px-4 pr-2 flex items-center justify-between border-b">
					<span className="text-muted-foreground text-sm">Assets</span>
					<div className="flex items-center gap-0">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon"
										variant="text"
										onClick={() =>
											setMediaViewMode(
												mediaViewMode === "grid" ? "list" : "grid",
											)
										}
										disabled={isProcessing}
										className="items-center justify-center"
									>
										{mediaViewMode === "grid" ? (
											<HugeiconsIcon icon={LeftToRightListDashIcon} />
										) : (
											<HugeiconsIcon icon={GridViewIcon} />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>
										{mediaViewMode === "grid"
											? "Switch to list view"
											: "Switch to grid view"}
									</p>
								</TooltipContent>
								<Tooltip>
									<DropdownMenu>
										<TooltipTrigger asChild>
											<DropdownMenuTrigger asChild>
												<Button
													size="icon"
													variant="text"
													disabled={isProcessing}
													className="items-center justify-center"
												>
													<HugeiconsIcon icon={SortingOneNineIcon} />
												</Button>
											</DropdownMenuTrigger>
										</TooltipTrigger>
										<DropdownMenuContent align="end">
											<SortMenuItem
												label="Name"
												sortKey="name"
												currentSortBy={sortBy}
												currentSortOrder={sortOrder}
												onSort={({ key }) => {
													if (sortBy === key) {
														setSortOrder(sortOrder === "asc" ? "desc" : "asc");
													} else {
														setSortBy(key);
														setSortOrder("asc");
													}
												}}
											/>
											<SortMenuItem
												label="Type"
												sortKey="type"
												currentSortBy={sortBy}
												currentSortOrder={sortOrder}
												onSort={({ key }) => {
													if (sortBy === key) {
														setSortOrder(sortOrder === "asc" ? "desc" : "asc");
													} else {
														setSortBy(key);
														setSortOrder("asc");
													}
												}}
											/>
											<SortMenuItem
												label="Duration"
												sortKey="duration"
												currentSortBy={sortBy}
												currentSortOrder={sortOrder}
												onSort={({ key }) => {
													if (sortBy === key) {
														setSortOrder(sortOrder === "asc" ? "desc" : "asc");
													} else {
														setSortBy(key);
														setSortOrder("asc");
													}
												}}
											/>
											<SortMenuItem
												label="File size"
												sortKey="size"
												currentSortBy={sortBy}
												currentSortOrder={sortOrder}
												onSort={({ key }) => {
													if (sortBy === key) {
														setSortOrder(sortOrder === "asc" ? "desc" : "asc");
													} else {
														setSortBy(key);
														setSortOrder("asc");
													}
												}}
											/>
										</DropdownMenuContent>
									</DropdownMenu>
									<TooltipContent>
										<p>
											Sort by {sortBy} (
											{sortOrder === "asc" ? "ascending" : "descending"})
										</p>
									</TooltipContent>
								</Tooltip>
							</Tooltip>
						</TooltipProvider>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								disabled={isProcessing}
								size="sm"
								className="items-center justify-center gap-1.5 ml-1.5 hover:bg-accent px-3"
							>
								<HugeiconsIcon icon={CloudUploadIcon} />
								Import
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={openFilePicker}
								className="gap-2"
							>
								<HugeiconsIcon icon={ComputerIcon} className="size-4" />
								From Device
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIsUrlDialogOpen(true)}
								className="gap-2"
							>
								<HugeiconsIcon icon={Link04Icon} className="size-4" />
								From URL
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					</div>
				</div>

			<div className="scrollbar-thin size-full overflow-y-auto">
				<div className="w-full flex-1 p-2 pt-1">
						{isDragOver || filteredMediaItems.length === 0 ? (
							<MediaDragOverlay
								isVisible={true}
								isProcessing={isProcessing}
								progress={progress}
								onClick={openFilePicker}
							/>
						) : mediaViewMode === "grid" ? (
							<GridView
								items={filteredMediaItems}
								renderPreview={renderPreview}
								onRemove={handleRemove}
								onAddToTimeline={addElementAtTime}
								highlightedId={highlightedId}
								registerElement={registerElement}
							/>
						) : (
							<ListView
								items={filteredMediaItems}
								renderPreview={renderCompactPreview}
								onRemove={handleRemove}
								onAddToTimeline={addElementAtTime}
								highlightedId={highlightedId}
								registerElement={registerElement}
							/>
						)}
					</div>
				</div>
			</div>

			<Dialog open={isUrlDialogOpen} onOpenChange={setIsUrlDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Import from URL</DialogTitle>
						<DialogDescription>
							Enter a URL to import a remote media file (image, video, or
							audio).
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<Input
							placeholder="https://example.com/media.mp4"
							value={urlInput}
							onChange={(event) => setUrlInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !isUrlImporting) {
									handleUrlImport();
								}
							}}
							disabled={isUrlImporting}
						/>
					</DialogBody>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsUrlDialogOpen(false)}
							disabled={isUrlImporting}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleUrlImport}
							disabled={isUrlImporting || !urlInput.trim()}
						>
							{isUrlImporting ? "Importing..." : "Import"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function MediaItemWithContextMenu({
	item,
	children,
	onRemove,
}: {
	item: MediaAsset;
	children: React.ReactNode;
	onRemove: ({ event, id }: { event: React.MouseEvent; id: string }) => void;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>Export clips</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					onClick={(event) => onRemove({ event, id: item.id })}
				>
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function GridView({
	items,
	renderPreview,
	onRemove,
	onAddToTimeline,
	highlightedId,
	registerElement,
}: {
	items: MediaAsset[];
	renderPreview: (item: MediaAsset) => React.ReactNode;
	onRemove: ({ event, id }: { event: React.MouseEvent; id: string }) => void;
	onAddToTimeline: ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: number;
	}) => boolean;
	highlightedId: string | null;
	registerElement: (id: string, element: HTMLElement | null) => void;
}) {
	return (
		<div
			className="grid gap-1.5"
			style={{
				gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
			}}
		>
			{items.map((item) => (
				<div key={item.id} ref={(el) => registerElement(item.id, el)}>
					<MediaItemWithContextMenu item={item} onRemove={onRemove}>
						<DraggableItem
							name={item.name}
							preview={renderPreview(item)}
							dragData={{
								id: item.id,
								type: "media",
								mediaType: item.type,
								name: item.name,
							}}
							shouldShowPlusOnDrag={false}
							onAddToTimeline={({ currentTime }) =>
								onAddToTimeline({ asset: item, startTime: currentTime })
							}
							isRounded={false}
							variant="card"
							containerClassName="w-full"
							isHighlighted={highlightedId === item.id}
						/>
					</MediaItemWithContextMenu>
				</div>
			))}
		</div>
	);
}

function ListView({
	items,
	renderPreview,
	onRemove,
	onAddToTimeline,
	highlightedId,
	registerElement,
}: {
	items: MediaAsset[];
	renderPreview: (item: MediaAsset) => React.ReactNode;
	onRemove: ({ event, id }: { event: React.MouseEvent; id: string }) => void;
	onAddToTimeline: ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: number;
	}) => boolean;
	highlightedId: string | null;
	registerElement: (id: string, element: HTMLElement | null) => void;
}) {
	return (
		<div className="space-y-1">
			{items.map((item) => (
				<div key={item.id} ref={(el) => registerElement(item.id, el)}>
					<MediaItemWithContextMenu item={item} onRemove={onRemove}>
						<DraggableItem
							name={item.name}
							preview={renderPreview(item)}
							dragData={{
								id: item.id,
								type: "media",
								mediaType: item.type,
								name: item.name,
							}}
							shouldShowPlusOnDrag={false}
							onAddToTimeline={({ currentTime }) =>
								onAddToTimeline({ asset: item, startTime: currentTime })
							}
							variant="compact"
							isHighlighted={highlightedId === item.id}
						/>
					</MediaItemWithContextMenu>
				</div>
			))}
		</div>
	);
}

const formatDuration = ({ duration }: { duration: number }) => {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
};

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
			{formatDuration({ duration })}
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
	variant,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant: "muted" | "bordered";
}) {
	const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

	return (
		<div
			className={cn(
				"text-muted-foreground flex size-full flex-col items-center justify-center rounded",
				variant === "muted" ? "bg-muted/30" : "border",
			)}
		>
			<HugeiconsIcon icon={icon} className={iconClassName} />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
		</div>
	);
}

function MediaPreview({
	item,
	variant = "grid",
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
}) {
	const shouldShowDurationBadge = variant === "grid";

	if (item.type === "image") {
		return (
			<div className="relative flex size-full items-center justify-center">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
			</div>
		);
	}

	if (item.type === "video") {
		if (item.thumbnailUrl) {
			return (
				<div className="relative size-full">
					<Image
						src={item.thumbnailUrl}
						alt={item.name}
						fill
						sizes="100vw"
						className="rounded object-cover"
						loading="lazy"
						unoptimized
					/>
					{shouldShowDurationBadge ? (
						<MediaDurationBadge duration={item.duration} />
					) : null}
				</div>
			);
		}

		return (
			<MediaTypePlaceholder
				icon={Video01Icon}
				label="Video"
				duration={item.duration}
				variant="muted"
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<MediaTypePlaceholder
				icon={MusicNote03Icon}
				label="Audio"
				duration={item.duration}
				variant="bordered"
			/>
		);
	}

	return (
		<MediaTypePlaceholder icon={Image02Icon} label="Unknown" variant="muted" />
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: "name" | "type" | "duration" | "size";
	currentSortBy: string;
	currentSortOrder: "asc" | "desc";
	onSort: ({ key }: { key: "name" | "type" | "duration" | "size" }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onClick={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}

function createElementFromMedia({
	asset,
	startTime,
}: {
	asset: MediaAsset;
	startTime: number;
}): CreateTimelineElement {
	const duration =
		asset.duration ?? TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION;

	switch (asset.type) {
		case "video":
			return buildVideoElement({
				mediaId: asset.id,
				name: asset.name,
				duration,
				startTime,
			});
		case "image":
			return buildImageElement({
				mediaId: asset.id,
				name: asset.name,
				duration,
				startTime,
			});
		case "audio":
			return buildUploadAudioElement({
				mediaId: asset.id,
				name: asset.name,
				duration,
				startTime,
			});
		default:
			throw new Error(`Unsupported media type: ${asset.type}`);
	}
}
