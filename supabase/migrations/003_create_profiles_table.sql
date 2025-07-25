-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    full_name VARCHAR(255),
    role VARCHAR(20) CHECK (role IN ('patient', 'caregiver')),
    user_type VARCHAR(20) CHECK (user_type IN ('patient', 'caregiver')),
    avatar_url TEXT,
    date_of_birth DATE,
    diagnosis_date DATE,
    medication_sensitivity TEXT,
    emergency_contact TEXT,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
    phone_number VARCHAR(20),
    preferences JSONB DEFAULT '{}',
    profile_setup_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON profiles(user_type);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
-- Users can view and update their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow caregivers to view basic info of connected patients
CREATE POLICY "Caregivers can view connected patients" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM patient_caregiver_connections 
            WHERE patient_id = profiles.id 
            AND caregiver_id = auth.uid()
            AND connection_status = 'active'
        )
    );

-- Allow patients to view basic info of connected caregivers  
CREATE POLICY "Patients can view connected caregivers" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM patient_caregiver_connections 
            WHERE caregiver_id = profiles.id 
            AND patient_id = auth.uid()
            AND connection_status = 'active'
        )
    );

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id, 
        email, 
        first_name, 
        last_name, 
        role,
        full_name
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'firstName'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'lastName'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'patient'),
        COALESCE(
            NEW.raw_user_meta_data->>'full_name', 
            CONCAT(
                COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'firstName', ''),
                ' ',
                COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'lastName', '')
            )
        )
    );
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger to automatically create profile when user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add trigger for updated_at
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 