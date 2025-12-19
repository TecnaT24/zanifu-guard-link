import { PhaseCard, PhaseStatus } from "./PhaseCard";
import { Shield, ShoppingCart, BarChart3, FileCheck } from "lucide-react";

interface Phase {
  phase: number;
  title: string;
  description: string;
  icon: typeof Shield;
  status: PhaseStatus;
  progress: number;
  features: string[];
}

const phases: Phase[] = [
  {
    phase: 1,
    title: "Authentication & Access Control",
    description: "Secure user registration, login with 2FA, and role-based access control system",
    icon: Shield,
    status: "in-progress",
    progress: 15,
    features: [
      "Secure registration & login",
      "Two-Factor Authentication (2FA)",
      "Role-based access (3 roles)",
      "Session management",
      "Account lockout protection",
      "Login attempt logging",
    ],
  },
  {
    phase: 2,
    title: "E-Commerce Platform",
    description: "Digital products catalog with secure checkout and transaction audit trails",
    icon: ShoppingCart,
    status: "not-started",
    progress: 0,
    features: [
      "Product catalog",
      "Secure checkout flow",
      "Order history",
      "Transaction audit trails",
      "Fraud detection flags",
    ],
  },
  {
    phase: 3,
    title: "Security Administration",
    description: "Real-time security monitoring, user management, and system health metrics",
    icon: BarChart3,
    status: "not-started",
    progress: 0,
    features: [
      "Security log visualization",
      "User & role management",
      "Suspicious activity alerts",
      "System health metrics",
      "Session monitoring",
    ],
  },
  {
    phase: 4,
    title: "Regulatory Compliance",
    description: "Kenya DPA 2019 aligned data rights, consent management, and audit reporting",
    icon: FileCheck,
    status: "not-started",
    progress: 0,
    features: [
      "User data rights portal",
      "Consent management",
      "Compliance dashboard",
      "Breach notification workflow",
      "Exportable audit reports",
    ],
  },
];

export function ProgressDashboard() {
  const totalProgress = Math.round(phases.reduce((acc, p) => acc + p.progress, 0) / phases.length);

  return (
    <section className="py-12">
      {/* Overall progress header */}
      <div className="mb-10 text-center">
        <h2 className="font-display text-2xl font-semibold text-foreground mb-2">
          Implementation Progress
        </h2>
        <p className="text-muted-foreground mb-6">
          Building a secure, compliant e-commerce platform for Zanifu Company
        </p>
        
        {/* Overall progress indicator */}
        <div className="max-w-md mx-auto">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Overall Project Progress</span>
            <span className="font-medium text-foreground">{totalProgress}%</span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 rounded-full"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Phase cards grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {phases.map((phase, index) => (
          <PhaseCard
            key={phase.phase}
            {...phase}
            animationDelay={index * 100}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-muted-foreground/50" />
          <span className="text-muted-foreground">Not Started</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-warning" />
          <span className="text-muted-foreground">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-success" />
          <span className="text-muted-foreground">Complete</span>
        </div>
      </div>
    </section>
  );
}
