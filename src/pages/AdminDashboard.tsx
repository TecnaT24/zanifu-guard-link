import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, Users, Activity, ArrowLeft, RefreshCw, 
  CheckCircle, XCircle, AlertTriangle, Clock, Unlock, Lock, UserCog
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type LoginAttempt = Database["public"]["Tables"]["login_attempts"]["Row"];
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("customer");
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    failedLogins: 0,
    lockedAccounts: 0,
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
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.user_id)?.role,
      }));

      setUsers(usersWithRoles);

      const { data: attempts, error: attemptsError } = await supabase
        .from("login_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (attemptsError) throw attemptsError;
      setLoginAttempts(attempts || []);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeToday = (profiles || []).filter(p => 
        p.last_login_at && new Date(p.last_login_at) >= today
      ).length;

      const failedLogins = (attempts || []).filter(a => 
        !a.success && new Date(a.created_at) >= today
      ).length;

      const lockedAccounts = (profiles || []).filter(p => p.account_locked).length;

      setStats({
        totalUsers: profiles?.length || 0,
        activeToday,
        failedLogins,
        lockedAccounts,
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

  const openRoleDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setSelectedRole(user.role || "customer");
    setRoleDialogOpen(true);
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
            Manage users, monitor security, and view system activity
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">Registered accounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <Activity className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.activeToday}</div>
              <p className="text-xs text-muted-foreground">Logged in today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
              <XCircle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.failedLogins}</div>
              <p className="text-xs text-muted-foreground">Today's failures</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Locked Accounts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.lockedAccounts}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Users & Roles
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="h-4 w-4" />
              Login Activity
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
                                {/* Change Role Button */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRoleDialog(user)}
                                  disabled={actionLoading === user.user_id || user.user_id === currentUserId}
                                  title={user.user_id === currentUserId ? "Cannot modify your own role" : "Change role"}
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>

                                {/* Lock/Unlock Button */}
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
    </div>
  );
}
