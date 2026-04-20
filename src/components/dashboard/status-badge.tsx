import { Badge } from "#/components/ui/badge";
import { type IdeaStatus, STATUS_LABELS } from "#/lib/constants";
import { cn } from "#/lib/utils";

const STATUS_STYLES: Record<IdeaStatus, string> = {
	new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	under_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
	accepted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	declined: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
	redirected: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

interface StatusBadgeProps {
	status: IdeaStatus;
	className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
	return (
		<Badge variant="outline" className={cn("border-0", STATUS_STYLES[status], className)}>
			{STATUS_LABELS[status]}
		</Badge>
	);
}
