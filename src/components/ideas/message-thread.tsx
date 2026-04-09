import { formatDistanceToNow } from "date-fns";
import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";

interface Message {
	id: string;
	actorId: string;
	actorName: string;
	content: string | null;
	createdAt: string;
}

interface MessageThreadProps {
	messages: Message[];
	currentUserId: string;
	onSend: (content: string) => Promise<void>;
	isSending: boolean;
}

export function MessageThread({ messages, currentUserId, onSend, isSending }: MessageThreadProps) {
	const [draft, setDraft] = useState("");

	const handleSend = async () => {
		const text = draft.trim();
		if (!text) return;
		setDraft("");
		await onSend(text);
	};

	return (
		<div className="space-y-4">
			{/* Messages */}
			{messages.length === 0 ? (
				<p className="py-4 text-center text-sm text-muted-foreground">
					No messages yet. Start a conversation about this idea.
				</p>
			) : (
				<div className="space-y-3">
					{messages.map((msg) => {
						const isOwn = msg.actorId === currentUserId;
						return (
							<div
								key={msg.id}
								className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}
							>
								<div
									className={cn(
										"max-w-[85%] rounded-xl px-3 py-2 text-sm",
										isOwn ? "bg-primary text-primary-foreground" : "bg-muted",
									)}
								>
									{!isOwn && <p className="mb-0.5 text-xs font-medium">{msg.actorName}</p>}
									<p className="whitespace-pre-wrap">{msg.content}</p>
								</div>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
								</p>
							</div>
						);
					})}
				</div>
			)}

			{/* Compose */}
			<div className="flex gap-2">
				<Textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="Type a message..."
					className="min-h-[60px] resize-none"
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						}
					}}
				/>
				<Button
					size="icon"
					onClick={handleSend}
					disabled={!draft.trim() || isSending}
					className="shrink-0 self-end"
				>
					<Send className="size-4" />
				</Button>
			</div>
		</div>
	);
}
