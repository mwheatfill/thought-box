import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
import { AlertTriangle, ArrowRight, Lightbulb } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { createIdea } from "#/server/functions/ideas";

interface FallbackFormProps {
	categories: { id: string; name: string }[];
}

export function FallbackForm({ categories }: FallbackFormProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const submitFn = useServerFn(createIdea);

	const mutation = useMutation({
		mutationFn: () => submitFn({ data: { title, description, categoryId } }),
		onSuccess: (result) => {
			if (result && "data" in result && result.data) {
				confetti({
					particleCount: 80,
					spread: 60,
					origin: { y: 0.7 },
					colors: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"],
				});
			}
		},
		onError: () => toast.error("Failed to submit idea"),
	});

	const submittedData = mutation.data && "data" in mutation.data ? mutation.data.data : null;

	if (submittedData) {
		return (
			<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
						<Lightbulb className="size-5" />
						Idea Submitted!
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<p>
						<span className="font-medium">ID:</span> {submittedData.submissionId}
					</p>
					<p>
						<span className="font-medium">Title:</span> {submittedData.title}
					</p>
					<p>
						<span className="font-medium">Category:</span> {submittedData.categoryName}
					</p>
					{submittedData.assignedLeaderName && (
						<p>
							<span className="font-medium">Reviewer:</span> {submittedData.assignedLeaderName}
						</p>
					)}
					<Button asChild variant="outline" size="sm" className="mt-2 w-full">
						<Link to="/ideas/$submissionId" params={{ submissionId: submittedData.submissionId }}>
							View Idea
							<ArrowRight className="ml-2 size-3.5" />
						</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4 p-4">
			<Alert
				variant="destructive"
				className="border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 [&>svg]:text-yellow-600"
			>
				<AlertTriangle className="size-4" />
				<AlertDescription>
					The AI assistant is temporarily unavailable. Use this form to submit your idea directly.
				</AlertDescription>
			</Alert>

			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="title">What's your idea?</Label>
					<Textarea
						id="title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Summarize your idea in a sentence..."
						className="min-h-[60px]"
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="description">Tell us more</Label>
					<Textarea
						id="description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="What problem does it solve? How would it work?"
						className="min-h-[120px]"
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="category">Category</Label>
					<Select value={categoryId} onValueChange={setCategoryId}>
						<SelectTrigger id="category">
							<SelectValue placeholder="Select a category..." />
						</SelectTrigger>
						<SelectContent>
							{categories.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Button
					onClick={() => mutation.mutate()}
					disabled={!title.trim() || !description.trim() || !categoryId || mutation.isPending}
					className="w-full"
				>
					{mutation.isPending ? "Submitting..." : "Submit Idea"}
				</Button>
			</div>
		</div>
	);
}
