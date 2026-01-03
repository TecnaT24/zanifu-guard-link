import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle, CreditCard, Lock, ArrowLeft, Loader2, Smartphone } from "lucide-react";
import { formatKSH } from "@/lib/currency";

const Checkout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "mpesa">("mpesa");
  const [mpesaPhone, setMpesaPhone] = useState("");

  const { items: cartItems, clearCart, isLoading: cartLoading } = useCart(user?.id || null);

  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleCheckout = async () => {
    if (!user || cartItems.length === 0) return;

    if (paymentMethod === "mpesa" && !mpesaPhone) {
      toast({
        title: "Phone number required",
        description: "Please enter your M-Pesa phone number",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Create order with pending status first
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total_amount: totalPrice,
          status: paymentMethod === "mpesa" ? "pending" : "completed",
          payment_method: paymentMethod,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_purchase: item.product.price,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // If M-Pesa, trigger STK Push
      if (paymentMethod === "mpesa") {
        const { data: stkData, error: stkError } = await supabase.functions.invoke("mpesa-stk-push", {
          body: {
            phoneNumber: mpesaPhone,
            amount: totalPrice,
            orderId: order.id,
            accountReference: `SecureGuard-${order.id.substring(0, 8)}`,
          },
        });

        if (stkError) {
          console.error("STK Push error:", stkError);
          throw new Error(stkError.message || "Failed to initiate M-Pesa payment");
        }

        if (!stkData?.success) {
          throw new Error(stkData?.error || "M-Pesa payment initiation failed");
        }

        toast({
          title: "M-Pesa Payment Initiated",
          description: "Check your phone and enter your M-Pesa PIN to complete payment.",
        });
      }

      // Clear cart
      await clearCart();

      setOrderId(order.id);
      setOrderComplete(true);

      if (paymentMethod !== "mpesa") {
        toast({
          title: "Order placed successfully!",
          description: "Your digital products are now available",
        });
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (orderComplete) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16">
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="pt-8 pb-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Order Complete!</h1>
              <p className="text-muted-foreground mb-4">
                Thank you for your purchase. Your digital products are now available.
              </p>
              <Badge variant="outline" className="mb-6">
                Order ID: {orderId?.slice(0, 8)}
              </Badge>
              <div className="space-y-2">
                <Button onClick={() => navigate("/orders")} className="w-full">
                  View My Orders
                </Button>
                <Button variant="outline" onClick={() => navigate("/shop")} className="w-full">
                  Continue Shopping
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/shop")}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Shop
        </Button>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {cartItems.length === 0 ? (
                <p className="text-muted-foreground">Your cart is empty</p>
              ) : (
                <div className="space-y-4">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex gap-4">
                      <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            No img
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{item.product.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Qty: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatKSH(item.product.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatKSH(totalPrice)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Method Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Choose Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as "card" | "mpesa")}
                className="space-y-3"
              >
                {/* M-Pesa Option */}
                <div
                  className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    paymentMethod === "mpesa"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setPaymentMethod("mpesa")}
                >
                  <RadioGroupItem value="mpesa" id="mpesa" />
                  <Label htmlFor="mpesa" className="flex items-center gap-3 cursor-pointer flex-1">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">M-Pesa</p>
                      <p className="text-sm text-muted-foreground">Pay with M-Pesa mobile money</p>
                    </div>
                  </Label>
                </div>

                {/* Card Option */}
                <div
                  className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    paymentMethod === "card"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setPaymentMethod("card")}
                >
                  <RadioGroupItem value="card" id="card" />
                  <Label htmlFor="card" className="flex items-center gap-3 cursor-pointer flex-1">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Credit/Debit Card</p>
                      <p className="text-sm text-muted-foreground">Pay with Visa, Mastercard</p>
                    </div>
                  </Label>
                  <Badge variant="secondary">Demo</Badge>
                </div>
              </RadioGroup>

              <Separator />

              {/* M-Pesa Form */}
              {paymentMethod === "mpesa" && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 rounded-lg text-sm">
                    <p className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <Smartphone className="h-4 w-4" />
                      You will receive an M-Pesa prompt on your phone to complete payment.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mpesaPhone">M-Pesa Phone Number</Label>
                    <Input
                      id="mpesaPhone"
                      placeholder="e.g. 0712345678"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the phone number registered with M-Pesa
                    </p>
                  </div>
                </div>
              )}

              {/* Card Form (Demo) */}
              {paymentMethod === "card" && (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      This is a demo checkout. No real payment will be processed.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cardName">Name on Card</Label>
                    <Input id="cardName" placeholder="John Doe" defaultValue="Demo User" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card Number</Label>
                    <Input
                      id="cardNumber"
                      placeholder="4242 4242 4242 4242"
                      defaultValue="4242 4242 4242 4242"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiry">Expiry Date</Label>
                      <Input id="expiry" placeholder="MM/YY" defaultValue="12/25" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cvc">CVC</Label>
                      <Input id="cvc" placeholder="123" defaultValue="123" />
                    </div>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={isProcessing || cartItems.length === 0}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {paymentMethod === "mpesa" ? "Pay with M-Pesa" : "Complete Purchase"} - {formatKSH(totalPrice)}
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By completing this purchase, you agree to our Terms of Service
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Checkout;
