import confetti from "canvas-confetti";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function fireSubmissionConfetti() {
	confetti({
		particleCount: 80,
		spread: 60,
		origin: { y: 0.7 },
		colors: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"],
	});
}
