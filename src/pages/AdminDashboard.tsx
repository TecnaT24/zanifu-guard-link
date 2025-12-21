import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, Users, Activity, ArrowLeft, RefreshCw, 
  CheckCircle, XCircle, AlertTriangle, Clock, Unlock, Lock, UserCog,
  Flag, FileText, AlertOctagon, DollarSign, Zap
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type LoginAttempt = Database["public"]["Tables"]["login_attempts"]["Row"];
type FraudFlag = Database["public"]["Tables"]["fraud_flags"]["Row"];
type TransactionAudit = Database["public"]["Tables"]["transaction_audit"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface UserWithRole extends Profile {
  role?: AppRole;
}

export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [auditLogs, setAuditLogs] = useState<TransactionAudit[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("customer");
  const [selectedFlag, setSelectedFlag] = useState<FraudFlag | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    failedLogins: 0,
    lockedAccounts: 0,
    unresolvedFlags: 0,
    highSeverityFlags: 0,
  });
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }

    setCurrentUserId(session.user.id);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You don't have permission to access this page.",
      });
      navigate("/");
      return;
    }

    setIsAdmin(true);
    await loadData();
  };

  const loadData = async () => {
    setIsLoading(true);
    
    try {
      // Load profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Load roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.user_id)?.role,
      }));

      setUsers(usersWithRoles);

      // Load login attempts
      const { data: attempts, error: attemptsError } = await supabase
        .from("login_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (attemptsError) throw attemptsError;
      setLoginAttempts(attempts || []);

      // Load fraud flags
      const { data: flags, error: flagsError } = await supabase
        .from("fraud_flags")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (flagsError) throw flagsError;
      setFraudFlags(flags || []);

      // Load audit logs
      const { data: audits, error: auditsError } = await supabase
        .from("transaction_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (auditsError) throw auditsError;
      setAuditLogs(audits || []);

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeToday = (profiles || []).filter(p => 
        p.last_login_at && new Date(p.last_login_at) >= today
      ).length;

      const failedLogins = (attempts || []).filter(a => 
        !a.success && new Date(a.created_at) >= today
      ).length;

      const lockedAccounts = (profiles || []).filter(p => p.account_locked).length;
      
      const unresolvedFlags = (flags || []).filter(f => !f.resolved).length;
      const highSeverityFlags = (flags || []).filter(f => !f.resolved && f.severity === 'high').length;

      setStats({
        totalUsers: profiles?.length || 0,
        activeToday,
        failedLogins,
        lockedAccounts,
        unresolvedFlags,
        highSeverityFlags,
      });

    } catch (error: any) {
      console.error("Error loading admin data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load dashboard data.",
      });
    }

    setIsLoading(false);
  };

  const performAdminAction = async (
    action: "change_role" | "unlock_account" | "lock_account",
    targetUserId: string,
    newRole?: AppRole
  ) => {
    setActionLoading(targetUserId);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("admin-actions", {
        body: { action, targetUserId, newRole },
      });

      if (response.error) throw response.error;

      const actionLabels = {
        change_role: `Role changed to ${newRole}`,
        unlock_account: "Account unlocked",
        lock_account: "Account locked",
      };

      toast({
        title: "Success",
        description: actionLabels[action],
      });

      await loadData();
    } catch (error: any) {
      console.error("Admin action error:", error);
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: error.message || "Could not perform action.",
      });
    }

    setActionLoading(null);
    setRoleDialogOpen(false);
  };

  const resolveFraudFlag = async () => {
    if (!selectedFlag) return;
    
    setActionLoading(selectedFlag.id);
    
    try {
      const { error } = await supabase
        .from("fraud_flags")
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: currentUserId,
          resolution_notes: resolutionNotes,
        })
        .eq("id", selectedFlag.id);

      if (error) throw error;

      toast({
        title: "Flag Resolved",
        description: "The fraud flag has been marked as resolved.",
      });

      setResolveDialogOpen(false);
      setResolutionNotes("");
      setSelectedFlag(null);
      await loadData();
    } catch (error: any) {
      console.error("Resolve flag error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to resolve fraud flag.",
      });
    }
    
    setActionLoading(null);
  };

  const openRoleDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setSelectedRole(user.role || "customer");
    setRoleDialogOpen(true);
  };

  const openResolveDialog = (flag: FraudFlag) => {
    setSelectedFlag(flag);
    setResolutionNotes("");
    setResolveDialogOpen(true);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  const getRoleBadgeVariant = (role?: string) => {
    switch (role) {
      case "admin": return "destructive";
      case "security_personnel": return "default";
      default: return "secondary";
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case "high": return "destructive";
      case "medium": return "default";
      default: return "secondary";
    }
  };

  const getFlagTypeIcon = (flagType: string) => {
    switch (flagType) {
      case "velocity": return <Zap className="h-4 w-4" />;
      case "high_value": return <DollarSign className="h-4 w-4" />;
      case "daily_limit": return <AlertOctagon className="h-4 w-4" />;
      default: return <Flag className="h-4 w-4" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "create": return "Created";
      case "update": return "Updated";
      case "delete": return "Deleted";
      default: return action;
    }
  };

  const getUserEmail = (userId: string | null) => {
    if (!userId) return "System";
    const user = users.find(u => u.user_id === userId);
    return user?.email || userId.slice(0, 8) + "...";
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Checking access...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Badge variant="destructive" className="gap-1">
              <Shield className="h-3 w-3" />
              Admin
            </Badge>
            <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage users, monitor security, detect fraud, and view audit trails
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">Registered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <Activity className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.activeToday}</div>
              <p className="text-xs text-muted-foreground">Logged in</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
              <XCircle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.failedLogins}</div>
              <p className="text-xs text-muted-foreground">Today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Locked</CardTitle>
              <Lock className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.lockedAccounts}</div>
              <p className="text-xs text-muted-foreground">Accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Fraud Flags</CardTitle>
              <Flag className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.unresolvedFlags}</div>
              <p className="text-xs text-muted-foreground">Unresolved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">High Severity</CardTitle>
              <AlertOctagon className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.highSeverityFlags}</div>
              <p className="text-xs text-muted-foreground">Critical</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Logins</span>
            </TabsTrigger>
            <TabsTrigger value="fraud" className="gap-2 relative">
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">Fraud</span>
              {stats.unresolvedFlags > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {stats.unresolvedFlags}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>View and manage all registered users and their roles</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No users found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>2FA</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Last Login</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{user.full_name || "—"}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getRoleBadgeVariant(user.role)}>
                                {user.role || "customer"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {user.two_factor_enabled ? (
                                <Badge variant="outline" className="text-success border-success">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Enabled
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Disabled
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {user.account_locked ? (
                                <Badge variant="destructive">Locked</Badge>
                              ) : (
                                <Badge variant="outline" className="text-success border-success">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(user.last_login_at)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRoleDialog(user)}
                                  disabled={actionLoading === user.user_id || user.user_id === currentUserId}
                                  title={user.user_id === currentUserId ? "Cannot modify your own role" : "Change role"}
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>

                                {user.account_locked ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => performAdminAction("unlock_account", user.user_id)}
                                    disabled={actionLoading === user.user_id}
                                    className="text-success hover:text-success"
                                    title="Unlock account"
                                  >
                                    {actionLoading === user.user_id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Unlock className="h-4 w-4" />
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => performAdminAction("lock_account", user.user_id)}
                                    disabled={actionLoading === user.user_id || user.user_id === currentUserId}
                                    className="text-destructive hover:text-destructive"
                                    title={user.user_id === currentUserId ? "Cannot lock your own account" : "Lock account"}
                                  >
                                    {actionLoading === user.user_id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Lock className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Login Activity Log</CardTitle>
                <CardDescription>Recent login attempts across all users (last 100)</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading activity...</div>
                ) : loginAttempts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No login attempts recorded</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>User Agent</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loginAttempts.map((attempt) => (
                          <TableRow key={attempt.id}>
                            <TableCell>
                              {attempt.success ? (
                                <Badge variant="outline" className="text-success border-success">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Success
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Failed
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{attempt.email}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {attempt.failure_reason || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {attempt.user_agent || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(attempt.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fraud Detection Tab */}
          <TabsContent value="fraud">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-warning" />
                  Fraud Detection Flags
                </CardTitle>
                <CardDescription>
                  Automated fraud detection flags based on order patterns and user behavior
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading fraud flags...</div>
                ) : fraudFlags.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Flag className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p>No fraud flags detected</p>
                    <p className="text-sm">The system is monitoring for suspicious activity</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fraudFlags.map((flag) => (
                          <TableRow key={flag.id} className={flag.resolved ? "opacity-60" : ""}>
                            <TableCell>
                              {flag.resolved ? (
                                <Badge variant="outline" className="text-success border-success">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Resolved
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Open
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getFlagTypeIcon(flag.flag_type)}
                                <span className="capitalize">{flag.flag_type.replace("_", " ")}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getSeverityBadgeVariant(flag.severity)}>
                                {flag.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[250px]">
                              <p className="truncate" title={flag.description}>{flag.description}</p>
                              {flag.metadata && Object.keys(flag.metadata).length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {JSON.stringify(flag.metadata)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {getUserEmail(flag.user_id)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(flag.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              {!flag.resolved && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openResolveDialog(flag)}
                                  disabled={actionLoading === flag.id}
                                >
                                  {actionLoading === flag.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Resolve
                                    </>
                                  )}
                                </Button>
                              )}
                              {flag.resolved && flag.resolution_notes && (
                                <span className="text-xs text-muted-foreground" title={flag.resolution_notes}>
                                  {flag.resolution_notes.slice(0, 20)}...
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Trail Tab */}
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Transaction Audit Trail
                </CardTitle>
                <CardDescription>
                  Complete audit log of all order transactions and changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading audit logs...</div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p>No audit logs recorded</p>
                    <p className="text-sm">Transaction history will appear here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Changes</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge variant={log.action_type === "create" ? "default" : "secondary"}>
                                {getActionLabel(log.action_type)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="capitalize font-medium">{log.entity_type}</span>
                                {log.entity_id && (
                                  <p className="text-xs text-muted-foreground">
                                    {log.entity_id.slice(0, 8)}...
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {getUserEmail(log.user_id)}
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              {log.action_type === "create" && log.new_value && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">Amount: </span>
                                  <span className="font-medium">
                                    ${(log.new_value as any).total_amount?.toFixed(2) || "—"}
                                  </span>
                                  {(log.new_value as any).status && (
                                    <>
                                      <span className="text-muted-foreground ml-2">Status: </span>
                                      <span>{(log.new_value as any).status}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {log.action_type === "update" && (
                                <div className="text-xs">
                                  <span className="text-muted-foreground">
                                    {(log.old_value as any)?.status} → {(log.new_value as any)?.status}
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(log.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Role Change Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the role for {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="security_personnel">Security Personnel</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            
            <p className="text-sm text-muted-foreground mt-3">
              {selectedRole === "admin" && "⚠️ Admins have full access to manage users and system settings."}
              {selectedRole === "security_personnel" && "Security personnel can view login attempts and security logs."}
              {selectedRole === "customer" && "Customers have standard access to the e-commerce platform."}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedUser && performAdminAction("change_role", selectedUser.user_id, selectedRole)}
              disabled={actionLoading !== null}
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Fraud Flag Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Fraud Flag</DialogTitle>
            <DialogDescription>
              Mark this fraud flag as resolved and add resolution notes
            </DialogDescription>
          </DialogHeader>
          
          {selectedFlag && (
            <div className="py-4 space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={getSeverityBadgeVariant(selectedFlag.severity)}>
                    {selectedFlag.severity}
                  </Badge>
                  <span className="capitalize font-medium">
                    {selectedFlag.flag_type.replace("_", " ")}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{selectedFlag.description}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Resolution Notes</label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe how this flag was investigated and resolved..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={resolveFraudFlag}
              disabled={actionLoading !== null}
              className="bg-success hover:bg-success/90"
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Resolved
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}