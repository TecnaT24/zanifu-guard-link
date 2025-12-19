-- Create table for storing 2FA verification codes
CREATE TABLE public.two_factor_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes'),
    used BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.two_factor_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own codes
CREATE POLICY "Users can view their own 2FA codes"
ON public.two_factor_codes
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Allow insert for authenticated users
CREATE POLICY "Authenticated users can insert 2FA codes"
ON public.two_factor_codes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own codes (mark as used)
CREATE POLICY "Users can update their own 2FA codes"
ON public.two_factor_codes
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_two_factor_codes_user_email ON public.two_factor_codes(user_id, email);
CREATE INDEX idx_two_factor_codes_expires ON public.two_factor_codes(expires_at);