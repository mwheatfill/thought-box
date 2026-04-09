import { motion } from "motion/react";

/** Fade in from below with optional stagger delay */
export function FadeIn({
	children,
	delay = 0,
	className,
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay, ease: "easeOut" }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

/** Stagger children with incremental delays */
export function StaggerList({
	children,
	staggerDelay = 0.05,
	className,
}: {
	children: React.ReactNode[];
	staggerDelay?: number;
	className?: string;
}) {
	return (
		<div className={className}>
			{children.map((child, i) => (
				<FadeIn key={`stagger-${i}-${staggerDelay}`} delay={i * staggerDelay}>
					{child}
				</FadeIn>
			))}
		</div>
	);
}

/** Page-level entrance animation */
export function PageTransition({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
			className={className}
		>
			{children}
		</motion.div>
	);
}
