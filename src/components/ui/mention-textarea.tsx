import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";

export interface Mentionable {
	id: string;
	displayName: string;
	jobTitle?: string | null;
	photoUrl?: string | null;
}

interface MentionTextareaProps extends Omit<React.ComponentProps<"textarea">, "onChange"> {
	value: string;
	onChange: (value: string) => void;
	onSubmit?: () => void;
	directory: Mentionable[];
}

/**
 * Parse the user IDs currently mentioned in `text`. An ID is considered
 * "currently mentioned" if its display name appears in the text preceded by
 * `@` and followed by a word boundary. Same logic the picker uses on insert,
 * applied at parse time to stay stateless about edits.
 */
export function parseMentions(text: string, directory: Mentionable[]): string[] {
	const ids = new Set<string>();
	for (const user of directory) {
		const pattern = new RegExp(
			`@${user.displayName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?=\\s|$|[.,!?;:])`,
			"u",
		);
		if (pattern.test(text)) ids.add(user.id);
	}
	return Array.from(ids);
}

/** Initials helper kept identical to the avatar fallback used elsewhere. */
function initials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.slice(0, 2);
}

export function MentionTextarea({
	value,
	onChange,
	onSubmit,
	directory,
	className,
	onKeyDown,
	...rest
}: MentionTextareaProps) {
	const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
	const [picker, setPicker] = React.useState<{ anchor: number; query: string } | null>(null);
	const [selectedIndex, setSelectedIndex] = React.useState(0);

	const matches = React.useMemo(() => {
		if (!picker) return [];
		const q = picker.query.toLowerCase();
		return directory
			.filter((u) => u.displayName.toLowerCase().includes(q))
			.slice(0, 6);
	}, [picker, directory]);

	React.useEffect(() => {
		if (selectedIndex >= matches.length) setSelectedIndex(0);
	}, [matches.length, selectedIndex]);

	const closePicker = () => setPicker(null);

	const computePickerFromState = (text: string, caret: number) => {
		// Walk back from caret to find an unbroken `@token` token whose `@`
		// is either at the start of the string or preceded by whitespace.
		let i = caret - 1;
		while (i >= 0 && /[\w'-]/u.test(text[i])) i--;
		if (i < 0 || text[i] !== "@") {
			closePicker();
			return;
		}
		const before = i === 0 ? " " : text[i - 1];
		if (!/\s/u.test(before) && i !== 0) {
			closePicker();
			return;
		}
		setPicker({ anchor: i, query: text.slice(i + 1, caret) });
	};

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const next = e.target.value;
		onChange(next);
		const caret = e.target.selectionStart ?? next.length;
		computePickerFromState(next, caret);
	};

	const handleSelect = () => {
		const el = textareaRef.current;
		if (!el) return;
		computePickerFromState(el.value, el.selectionStart ?? el.value.length);
	};

	const insertMention = (user: Mentionable) => {
		if (!picker) return;
		const el = textareaRef.current;
		if (!el) return;
		const caret = el.selectionStart ?? value.length;
		const replaced = `${value.slice(0, picker.anchor)}@${user.displayName} ${value.slice(caret)}`;
		const nextCaret = picker.anchor + user.displayName.length + 2; // '@' + name + ' '
		onChange(replaced);
		closePicker();
		// Restore focus + caret on next tick so React has applied the value.
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(nextCaret, nextCaret);
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (picker && matches.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i + 1) % matches.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				insertMention(matches[selectedIndex]);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				closePicker();
				return;
			}
		}
		// Defer plain Enter to onSubmit (matches MessageThread send behavior).
		if (e.key === "Enter" && !e.shiftKey && !picker) {
			e.preventDefault();
			onSubmit?.();
			return;
		}
		onKeyDown?.(e);
	};

	return (
		<div className="relative w-full">
			<Textarea
				ref={textareaRef}
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onSelect={handleSelect}
				onClick={handleSelect}
				className={className}
				{...rest}
			/>
			{picker && matches.length > 0 && (
				<div className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border bg-popover shadow-md">
					<ul className="max-h-60 overflow-auto py-1">
						{matches.map((user, i) => (
							<li key={user.id}>
								<button
									type="button"
									onMouseDown={(e) => {
										e.preventDefault();
										insertMention(user);
									}}
									onMouseEnter={() => setSelectedIndex(i)}
									className={cn(
										"flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
										i === selectedIndex ? "bg-accent" : "hover:bg-accent/60",
									)}
								>
									<Avatar className="size-6">
										{user.photoUrl && <AvatarImage src={user.photoUrl} alt={user.displayName} />}
										<AvatarFallback className="text-[10px]">
											{initials(user.displayName)}
										</AvatarFallback>
									</Avatar>
									<span className="flex min-w-0 flex-col">
										<span className="truncate font-medium">{user.displayName}</span>
										{user.jobTitle && (
											<span className="truncate text-xs text-muted-foreground">{user.jobTitle}</span>
										)}
									</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
