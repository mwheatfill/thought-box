import { Building2, Mail, MapPin, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

interface PersonInfo {
	id: string;
	displayName: string;
	email: string;
	jobTitle?: string | null;
	department?: string | null;
	officeLocation?: string | null;
	managerDisplayName?: string | null;
	photoUrl?: string | null;
}

interface PeopleCardProps {
	person: PersonInfo;
	title: string;
	submittedAt?: string;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function getAvatarColor(id: string): string {
	let hash = 0;
	for (const char of id) {
		hash = char.charCodeAt(0) + ((hash << 5) - hash);
	}
	const colors = [
		"bg-blue-500",
		"bg-green-500",
		"bg-purple-500",
		"bg-orange-500",
		"bg-pink-500",
		"bg-teal-500",
		"bg-indigo-500",
		"bg-rose-500",
	];
	return colors[Math.abs(hash) % colors.length];
}

export function PeopleCard({ person, title, submittedAt }: PeopleCardProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex items-start gap-3">
					<Avatar className="size-10">
						{person.photoUrl && <AvatarImage src={person.photoUrl} alt={person.displayName} />}
						<AvatarFallback className={`${getAvatarColor(person.id)} text-white text-xs`}>
							{getInitials(person.displayName)}
						</AvatarFallback>
					</Avatar>

					<div className="min-w-0 flex-1 space-y-1">
						<div>
							<span className="font-medium">{person.displayName}</span>
							<a
								href={`mailto:${person.email}`}
								className="ml-1.5 inline-flex text-muted-foreground hover:text-foreground"
								title={person.email}
							>
								<Mail className="size-3.5" />
							</a>
							{person.jobTitle && (
								<p className="text-xs text-muted-foreground">{person.jobTitle}</p>
							)}
						</div>

						<div className="space-y-0.5 text-xs text-muted-foreground">
							{person.department && (
								<div className="flex items-center gap-1.5">
									<Building2 className="size-3" />
									<span>{person.department}</span>
								</div>
							)}
							{person.officeLocation && (
								<div className="flex items-center gap-1.5">
									<MapPin className="size-3" />
									<span>{person.officeLocation}</span>
								</div>
							)}
							{person.managerDisplayName && (
								<div className="flex items-center gap-1.5">
									<User className="size-3" />
									<span>Reports to {person.managerDisplayName}</span>
								</div>
							)}
						</div>

						{submittedAt && (
							<p className="text-xs text-muted-foreground">
								Submitted{" "}
								{new Date(submittedAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
