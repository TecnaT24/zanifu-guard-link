import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Database } from "@/integrations/supabase/types";

type FraudFlag = Database["public"]["Tables"]["fraud_flags"]["Row"];

interface FraudAnalyticsProps {
  fraudFlags: FraudFlag[];
}

const COLORS = {
  velocity: "hsl(var(--chart-1))",
  high_value: "hsl(var(--chart-2))",
  daily_limit: "hsl(var(--chart-3))",
  other: "hsl(var(--chart-4))",
  high: "hsl(var(--destructive))",
  medium: "hsl(var(--chart-2))",
  low: "hsl(var(--chart-3))",
  resolved: "hsl(var(--success))",
  unresolved: "hsl(var(--destructive))",
};

export default function FraudAnalytics({ fraudFlags }: FraudAnalyticsProps) {
  // Process data for trends over time (last 30 days)
  const trendData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    return last30Days.map(date => {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayFlags = fraudFlags.filter(flag => {
        const flagDate = new Date(flag.created_at);
        return flagDate >= date && flagDate < nextDay;
      });

      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        total: dayFlags.length,
        high: dayFlags.filter(f => f.severity === "high").length,
        medium: dayFlags.filter(f => f.severity === "medium").length,
        low: dayFlags.filter(f => f.severity === "low").length,
      };
    });
  }, [fraudFlags]);

  // Process data by flag type
  const typeData = useMemo(() => {
    const types: Record<string, number> = {};
    fraudFlags.forEach(flag => {
      types[flag.flag_type] = (types[flag.flag_type] || 0) + 1;
    });
    
    return Object.entries(types).map(([name, value]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value,
      key: name,
    }));
  }, [fraudFlags]);

  // Process data by severity
  const severityData = useMemo(() => {
    const severities: Record<string, number> = { high: 0, medium: 0, low: 0 };
    fraudFlags.forEach(flag => {
      if (severities[flag.severity] !== undefined) {
        severities[flag.severity]++;
      }
    });
    
    return Object.entries(severities).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      key: name,
    }));
  }, [fraudFlags]);

  // Resolution rate data
  const resolutionData = useMemo(() => {
    const resolved = fraudFlags.filter(f => f.resolved).length;
    const unresolved = fraudFlags.filter(f => !f.resolved).length;
    
    return [
      { name: "Resolved", value: resolved, key: "resolved" },
      { name: "Unresolved", value: unresolved, key: "unresolved" },
    ];
  }, [fraudFlags]);

  // Weekly comparison
  const weeklyData = useMemo(() => {
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (7 - i) * 7);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    });

    return weeks.slice(0, -1).map((weekStart, i) => {
      const weekEnd = weeks[i + 1];
      
      const weekFlags = fraudFlags.filter(flag => {
        const flagDate = new Date(flag.created_at);
        return flagDate >= weekStart && flagDate < weekEnd;
      });

      return {
        week: `Week ${i + 1}`,
        flags: weekFlags.length,
        resolved: weekFlags.filter(f => f.resolved).length,
      };
    });
  }, [fraudFlags]);

  const getColor = (key: string) => {
    return COLORS[key as keyof typeof COLORS] || "hsl(var(--chart-5))";
  };

  return (
    <div className="space-y-6">
      {/* Trend Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Fraud Trends (Last 30 Days)</CardTitle>
          <CardDescription>Daily fraud flags by severity level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="high" 
                  stackId="1"
                  stroke="hsl(var(--destructive))"
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.6}
                  name="High Severity"
                />
                <Area 
                  type="monotone" 
                  dataKey="medium" 
                  stackId="1"
                  stroke="hsl(var(--chart-2))"
                  fill="hsl(var(--chart-2))"
                  fillOpacity={0.6}
                  name="Medium Severity"
                />
                <Area 
                  type="monotone" 
                  dataKey="low" 
                  stackId="1"
                  stroke="hsl(var(--chart-3))"
                  fill="hsl(var(--chart-3))"
                  fillOpacity={0.6}
                  name="Low Severity"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Flag Types Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Fraud by Type</CardTitle>
            <CardDescription>Distribution of fraud flag categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {typeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {typeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getColor(entry.key)} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No fraud data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Severity Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Severity Breakdown</CardTitle>
            <CardDescription>Flags categorized by severity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {severityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getColor(entry.key)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Resolution Rate */}
        <Card>
          <CardHeader>
            <CardTitle>Resolution Status</CardTitle>
            <CardDescription>Resolved vs unresolved fraud flags</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={resolutionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {resolutionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getColor(entry.key)} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Overview</CardTitle>
            <CardDescription>Fraud flags and resolutions per week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="flags" 
                    fill="hsl(var(--chart-1))" 
                    radius={[4, 4, 0, 0]}
                    name="Total Flags"
                  />
                  <Bar 
                    dataKey="resolved" 
                    fill="hsl(var(--success))" 
                    radius={[4, 4, 0, 0]}
                    name="Resolved"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
