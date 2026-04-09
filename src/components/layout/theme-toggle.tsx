import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

type Theme = "light" | "dark" | "auto";

function getResolvedTheme(): "light" | "dark" {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "auto";
	const stored = localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto") return stored;
	return "auto";
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = theme === "auto" ? (prefersDark ? "dark" : "light") : theme;

	root.classList.remove("light", "dark");
	root.classList.add(resolved);
	root.style.colorScheme = resolved;
	localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("auto");
	const [resolved, setResolved] = useState<"light" | "dark">("light");

	useEffect(() => {
		setTheme(getStoredTheme());
		setResolved(getResolvedTheme());
	}, []);

	function selectTheme(next: Theme) {
		setTheme(next);
		applyTheme(next);
		setResolved(
			next === "auto"
				? window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light"
				: next,
		);
	}

	const Icon = theme === "auto" ? Monitor : resolved === "dark" ? Moon : Sun;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Toggle theme">
					<Icon className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => selectTheme("light")}>
					<Sun className="mr-2 size-4" />
					Light
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => selectTheme("dark")}>
					<Moon className="mr-2 size-4" />
					Dark
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => selectTheme("auto")}>
					<Monitor className="mr-2 size-4" />
					System
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
