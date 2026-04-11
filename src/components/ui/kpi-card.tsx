import { type KpiColor, KPI_COLORS } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { Card, CardContent } from "./card";

interface KpiCardProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	detail?: string;
	color?: KpiColor;
	variant?: "destructive";
	onClick?: () => void;
	isActive?: boolean;
}

export function KpiCard({
	icon: Icon,
	label,
	value,
	detail,
	color,
	variant,
	onClick,
	isActive,
}: KpiCardProps) {
	const isDestructive = variant === "destructive";
	const colorStyle = color ? KPI_COLORS[color] : null;
	const iconBg = colorStyle?.bg ?? (isDestructive ? "bg-red-100 dark:bg-red-900/30" : "bg-muted");
	const iconColor = colorStyle?.icon ?? (isDestructive ? "text-red-600 dark:text-red-400" : "text-muted-foreground");
	const Wrapper = onClick ? "button" : "div";

	return (
		<Wrapper
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className={onClick ? "w-full text-left" : undefined}
		>
			<Card
				className={cn(
					"h-full transition-all",
					isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
					onClick && !isActive && "hover:border-primary/30 hover:bg-muted/30",
				)}
			>
				<CardContent className="flex h-full items-center gap-3 p-4">
					<div className={cn("rounded-full p-2", iconBg)}>
						<Icon className={cn("size-4", iconColor)} />
					</div>
					<div className="min-w-0">
						<p
							className={cn(
								"text-2xl font-bold",
								isDestructive && "text-red-600 dark:text-red-400",
							)}
						>
							{value}
						</p>
						<p className="text-xs text-muted-foreground">{label}</p>
						{detail && <p className="text-xs text-muted-foreground/70">{detail}</p>}
					</div>
				</CardContent>
			</Card>
		</Wrapper>
	);
}
