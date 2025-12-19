import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export type PhaseStatus = "not-started" | "in-progress" | "complete";

interface PhaseCardProps {
  phase: number;
  title: string;
  description: string;
  icon: LucideIcon;
  status: PhaseStatus;
  progress: number;
  features: string[];
  onClick?: () => void;
  animationDelay?: number;
}

const statusConfig: Record<PhaseStatus, { label: string; className: string; progressClass: string }> = {
  "not-started": {
    label: "Not Started",
    className: "bg-muted text-muted-foreground",
    progressClass: "bg-muted",
  },
  "in-progress": {
    label: "In Progress",
    className: "bg-warning/10 text-warning border-warning/30",
    progressClass: "[&>div]:bg-warning",
  },
  complete: {
    label: "Complete",
    className: "bg-success/10 text-success border-success/30",
    progressClass: "[&>div]:bg-success",
  },
};

export function PhaseCard({
  phase,
  title,
  description,
  icon: Icon,
  status,
  progress,
  features,
  onClick,
  animationDelay = 0,
}: PhaseCardProps) {
  const config = statusConfig[status];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-6 transition-all duration-300",
        "hover:shadow-corporate hover:border-primary/30 cursor-pointer",
        "animate-slide-up"
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Phase number badge */}
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 flex items-end justify-start pb-6 pl-6">
        <span className="text-3xl font-bold text-primary/20">{phase}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-semibold text-foreground mb-1 truncate">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        </div>
      </div>

      {/* Status badge */}
      <div className="mb-4">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            config.className
          )}
        >
          {config.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className={cn("h-2", config.progressClass)} />
      </div>

      {/* Features list */}
      <ul className="space-y-1.5">
        {features.slice(0, 4).map((feature, index) => (
          <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === "complete" ? "bg-success" : status === "in-progress" ? "bg-warning" : "bg-muted-foreground/50"
              )}
            />
            {feature}
          </li>
        ))}
        {features.length > 4 && (
          <li className="text-xs text-muted-foreground pl-3.5">+{features.length - 4} more</li>
        )}
      </ul>

      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
