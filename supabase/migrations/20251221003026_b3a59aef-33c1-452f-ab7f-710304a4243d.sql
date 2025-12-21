-- Create fraud_flags table for tracking suspicious activity
CREATE TABLE public.fraud_flags (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    flag_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    description TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create transaction_audit table for audit trails
CREATE TABLE public.transaction_audit (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    user_agent TEXT,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for fraud_flags (admins and security personnel only)
CREATE POLICY "Admins can manage fraud flags"
ON public.fraud_flags
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Security personnel can view fraud flags"
ON public.fraud_flags
FOR SELECT
USING (has_role(auth.uid(), 'security_personnel'::app_role));

CREATE POLICY "Security personnel can update fraud flags"
ON public.fraud_flags
FOR UPDATE
USING (has_role(auth.uid(), 'security_personnel'::app_role));

-- RLS policies for transaction_audit (admins and security personnel only)
CREATE POLICY "Admins can view all audit logs"
ON public.transaction_audit
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Security personnel can view audit logs"
ON public.transaction_audit
FOR SELECT
USING (has_role(auth.uid(), 'security_personnel'::app_role));

-- Insert policies for system to create audit entries
CREATE POLICY "Service role can insert fraud flags"
ON public.fraud_flags
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can insert audit logs"
ON public.transaction_audit
FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_fraud_flags_user_id ON public.fraud_flags(user_id);
CREATE INDEX idx_fraud_flags_order_id ON public.fraud_flags(order_id);
CREATE INDEX idx_fraud_flags_resolved ON public.fraud_flags(resolved);
CREATE INDEX idx_fraud_flags_severity ON public.fraud_flags(severity);
CREATE INDEX idx_transaction_audit_user_id ON public.transaction_audit(user_id);
CREATE INDEX idx_transaction_audit_order_id ON public.transaction_audit(order_id);
CREATE INDEX idx_transaction_audit_action_type ON public.transaction_audit(action_type);
CREATE INDEX idx_transaction_audit_created_at ON public.transaction_audit(created_at DESC);

-- Create trigger to auto-create audit entries on order changes
CREATE OR REPLACE FUNCTION public.audit_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.transaction_audit (user_id, order_id, action_type, entity_type, entity_id, new_value)
        VALUES (NEW.user_id, NEW.id, 'create', 'order', NEW.id, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.transaction_audit (user_id, order_id, action_type, entity_type, entity_id, old_value, new_value)
        VALUES (NEW.user_id, NEW.id, 'update', 'order', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_audit_order_changes
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.audit_order_changes();

-- Create function to auto-flag suspicious orders
CREATE OR REPLACE FUNCTION public.check_order_fraud()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recent_order_count INT;
    user_total_today NUMERIC;
BEGIN
    -- Check for multiple orders in short time (velocity check)
    SELECT COUNT(*) INTO recent_order_count
    FROM public.orders
    WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour'
    AND id != NEW.id;
    
    IF recent_order_count >= 3 THEN
        INSERT INTO public.fraud_flags (user_id, order_id, flag_type, severity, description, metadata)
        VALUES (
            NEW.user_id, 
            NEW.id, 
            'velocity', 
            'high', 
            'Multiple orders placed within 1 hour',
            jsonb_build_object('order_count', recent_order_count + 1)
        );
    END IF;
    
    -- Check for unusually high order amount
    IF NEW.total_amount > 500 THEN
        INSERT INTO public.fraud_flags (user_id, order_id, flag_type, severity, description, metadata)
        VALUES (
            NEW.user_id, 
            NEW.id, 
            'high_value', 
            'medium', 
            'Order amount exceeds threshold',
            jsonb_build_object('amount', NEW.total_amount)
        );
    END IF;
    
    -- Check total spending today
    SELECT COALESCE(SUM(total_amount), 0) INTO user_total_today
    FROM public.orders
    WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '24 hours'
    AND id != NEW.id;
    
    IF user_total_today + NEW.total_amount > 1000 THEN
        INSERT INTO public.fraud_flags (user_id, order_id, flag_type, severity, description, metadata)
        VALUES (
            NEW.user_id, 
            NEW.id, 
            'daily_limit', 
            'high', 
            'Daily spending limit exceeded',
            jsonb_build_object('daily_total', user_total_today + NEW.total_amount)
        );
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_check_order_fraud
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.check_order_fraud();