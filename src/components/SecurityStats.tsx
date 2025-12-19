import { Shield, Users, AlertTriangle, CheckCircle } from "lucide-react";

interface StatCardProps {
  icon: typeof Shield;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
}

function StatCard({ icon: Icon, label, value, trend, trendUp }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      {trend && (
        <span className={`ml-auto text-xs font-medium ${trendUp ? 'text-success' : 'text-destructive'}`}>
          {trend}
        </span>
      )}
    </div>
  );
}

export function SecurityStats() {
  // Mock data for demonstration
  const stats = [
    { icon: Shield, label: "Security Score", value: "A+", trend: undefined },
    { icon: Users, label: "Active Sessions", value: 0 },
    { icon: AlertTriangle, label: "Threats Blocked", value: 0 },
    { icon: CheckCircle, label: "Compliance Status", value: "Pending" },
  ];

  return (
    <section className="py-8">
      <h3 className="font-display text-lg font-semibold text-foreground mb-4">
        Security Overview
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>
    </section>
  );
}
