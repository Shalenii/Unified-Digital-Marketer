
-- Create settings table
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Policy for Public/Service Role access (simplification for this tool)
CREATE POLICY "Enable all access for all users" ON public.settings
FOR ALL USING (true) WITH CHECK (true);
