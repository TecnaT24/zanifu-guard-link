import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, Mail, Lock, User, ArrowLeft, AlertCircle, KeyRound } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email is too long"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type AuthStep = "credentials" | "2fa";

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupFullName, setSignupFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Only navigate on successful 2FA or non-2FA login
      if (session && authStep === "credentials") {
        // Don't auto-redirect, we need 2FA first
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, authStep]);

  const logLoginAttempt = async (email: string, success: boolean, failureReason?: string, userId?: string) => {
    try {
      await supabase.from("login_attempts").insert({
        email,
        success,
        failure_reason: failureReason,
        user_id: userId,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      // Silent fail for logging
    }
  };

  const send2FACode = async (email: string, userId: string) => {
    try {
      const response = await supabase.functions.invoke("send-2fa-code", {
        body: { email, userId },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return true;
    } catch (error: any) {
      console.error("Failed to send 2FA code:", error);
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    const validation = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
      });
      setErrors(fieldErrors);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (error) {
      await logLoginAttempt(loginEmail, false, error.message);
      
      let message = "Invalid email or password";
      if (error.message.includes("Invalid login credentials")) {
        message = "Invalid email or password. Please try again.";
      } else if (error.message.includes("Email not confirmed")) {
        message = "Please verify your email before logging in.";
      }
      
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: message,
      });
      setIsLoading(false);
      return;
    }

    // Login successful, now trigger 2FA
    if (data.user) {
      setPendingUserId(data.user.id);
      setPendingEmail(loginEmail.trim());
      
      const sent = await send2FACode(loginEmail.trim(), data.user.id);
      if (sent) {
        setAuthStep("2fa");
        setResendCooldown(60);
        toast({
          title: "Verification Required",
          description: "A 6-digit code has been sent to your email.",
        });
      } else {
        // Sign out since 2FA failed
        await supabase.auth.signOut();
        toast({
          variant: "destructive",
          title: "2FA Error",
          description: "Failed to send verification code. Please try again.",
        });
      }
    }

    setIsLoading(false);
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    if (verificationCode.length !== 6) {
      setErrors({ code: "Please enter a 6-digit code" });
      setIsLoading(false);
      return;
    }

    try {
      const response = await supabase.functions.invoke("verify-2fa-code", {
        body: { userId: pendingUserId, code: verificationCode },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;

      if (result.valid) {
        await logLoginAttempt(pendingEmail!, true, undefined, pendingUserId!);
        toast({
          title: "Welcome!",
          description: "Two-factor authentication successful.",
        });
        navigate("/");
      } else {
        setErrors({ code: result.error || "Invalid verification code" });
        toast({
          variant: "destructive",
          title: "Verification Failed",
          description: result.error || "Invalid or expired code. Please try again.",
        });
      }
    } catch (error: any) {
      console.error("2FA verification error:", error);
      toast({
        variant: "destructive",
        title: "Verification Error",
        description: "Something went wrong. Please try again.",
      });
    }

    setIsLoading(false);
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !pendingEmail || !pendingUserId) return;
    
    setIsLoading(true);
    const sent = await send2FACode(pendingEmail, pendingUserId);
    
    if (sent) {
      setResendCooldown(60);
      toast({
        title: "Code Sent",
        description: "A new verification code has been sent to your email.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Failed to Resend",
        description: "Could not send a new code. Please try again.",
      });
    }
    setIsLoading(false);
  };

  const handleBackToLogin = async () => {
    await supabase.auth.signOut();
    setAuthStep("credentials");
    setPendingUserId(null);
    setPendingEmail(null);
    setVerificationCode("");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    const validation = signupSchema.safeParse({
      fullName: signupFullName,
      email: signupEmail,
      password: signupPassword,
      confirmPassword: signupConfirmPassword,
    });

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
      });
      setErrors(fieldErrors);
      setIsLoading(false);
      return;
    }

    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: signupFullName.trim(),
        },
      },
    });

    if (error) {
      let message = "An error occurred during signup";
      if (error.message.includes("already registered")) {
        message = "This email is already registered. Please sign in instead.";
      }
      
      toast({
        variant: "destructive",
        title: "Signup Failed",
        description: message,
      });
    } else {
      // Update profile with full name
      if (data.user) {
        await supabase.from("profiles").update({ full_name: signupFullName.trim() }).eq("user_id", data.user.id);
        
        // Send 2FA code for new signup
        setPendingUserId(data.user.id);
        setPendingEmail(signupEmail.trim());
        
        const sent = await send2FACode(signupEmail.trim(), data.user.id);
        if (sent) {
          setAuthStep("2fa");
          setResendCooldown(60);
          toast({
            title: "Account Created!",
            description: "Please verify with the code sent to your email.",
          });
        } else {
          toast({
            title: "Account Created!",
            description: "Welcome to Zanifu Secure Commerce.",
          });
          navigate("/");
        }
      }
    }

    setIsLoading(false);
  };

  // 2FA Verification Screen
  if (authStep === "2fa") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card">
          <div className="container flex h-16 items-center">
            <button
              onClick={handleBackToLogin}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back to Login</span>
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
                <KeyRound className="h-7 w-7" />
              </div>
              <h1 className="font-display text-2xl font-bold text-foreground">Two-Factor Authentication</h1>
              <p className="text-sm text-muted-foreground mt-1">Enter the code sent to your email</p>
            </div>

            <Card className="shadow-corporate">
              <CardHeader>
                <CardTitle className="text-lg">Verification Code</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to <strong>{pendingEmail}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleVerify2FA} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="verification-code">Enter Code</Label>
                    <Input
                      id="verification-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                      disabled={isLoading}
                      autoFocus
                    />
                    {errors.code && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.code}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading || verificationCode.length !== 6}>
                    {isLoading ? "Verifying..." : "Verify Code"}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={resendCooldown > 0 || isLoading}
                      className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                    >
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center mt-6">
              <Shield className="inline h-3 w-3 mr-1" />
              Code expires in 10 minutes
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
              <Shield className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Zanifu Secure Commerce</h1>
            <p className="text-sm text-muted-foreground mt-1">Authentication Portal</p>
          </div>

          <Card className="shadow-corporate">
            <Tabs defaultValue="login" className="w-full">
              <CardHeader className="pb-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent>
                {/* Login Tab */}
                <TabsContent value="login" className="mt-0">
                  <CardTitle className="text-lg mb-1">Welcome back</CardTitle>
                  <CardDescription className="mb-6">Enter your credentials to access your account</CardDescription>
                  
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="you@example.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {errors.email && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {errors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {errors.password && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {errors.password}
                        </p>
                      )}
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Signing in..." : "Sign In"}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      <KeyRound className="inline h-3 w-3 mr-1" />
                      Two-factor authentication enabled
                    </p>
                  </form>
                </TabsContent>

                {/* Signup Tab */}
                <TabsContent value="signup" className="mt-0">
                  <CardTitle className="text-lg mb-1">Create an account</CardTitle>
                  <CardDescription className="mb-6">Enter your details to register</CardDescription>
                  
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder="John Doe"
                          value={signupFullName}
                          onChange={(e) => setSignupFullName(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {errors.fullName && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {errors.fullName}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="you@example.com"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {errors.email && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {errors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type="password"
                          placeholder="••••••••"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {errors.password && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {errors.password}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Min 8 chars with uppercase, lowercase, number & special character
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="signup-confirm"
                          type="password"
                          placeholder="••••••••"
                          value={signupConfirmPassword}
                          onChange={(e) => setSignupConfirmPassword(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {errors.confirmPassword && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {errors.confirmPassword}
                        </p>
                      )}
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Security notice */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            <Lock className="inline h-3 w-3 mr-1" />
            Protected by enterprise-grade security
          </p>
        </div>
      </main>
    </div>
  );
}
