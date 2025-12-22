-- Add resolution workflow columns to fraud_flags table
ALTER TABLE public.fraud_flags
ADD COLUMN IF NOT EXISTS resolution_type text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_by uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT NULL;

-- Update requires_approval for high severity flags via a function
CREATE OR REPLACE FUNCTION public.set_fraud_flag_approval_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- High severity flags require approval
    IF NEW.severity = 'high' THEN
        NEW.requires_approval := true;
    END IF;
    RETURN NEW;
END;
$function$;

-- Create trigger for new fraud flags
DROP TRIGGER IF EXISTS set_approval_requirement ON public.fraud_flags;
CREATE TRIGGER set_approval_requirement
    BEFORE INSERT ON public.fraud_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.set_fraud_flag_approval_requirement();

-- Update existing high severity flags to require approval
UPDATE public.fraud_flags
SET requires_approval = true
WHERE severity = 'high' AND resolved = false;