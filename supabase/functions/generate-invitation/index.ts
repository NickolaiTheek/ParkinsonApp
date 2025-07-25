import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { nanoid } from 'https://deno.land/x/nanoid@v3.0.0/nanoid.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  console.log('=== Generate Invitation Function Called ===');
  
  try {
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Missing authorization header' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    console.log('User auth result:', { 
      hasUser: !!user, 
      userId: user?.id, 
      userRole: user?.user_metadata?.role,
      authError: authError?.message 
    });
    
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Authentication failed',
        details: authError?.message || 'No user found'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Role check
    if (user.user_metadata?.role !== 'patient') {
      return new Response(JSON.stringify({ 
        error: 'Access denied',
        details: 'Only patients can generate invitation codes'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate invitation
    const invitationCode = nanoid(4);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    console.log('Generating invitation:', { code: invitationCode, patientId: user.id });

    // Insert to database
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    );

    const { error: insertError } = await supabaseAdmin
      .from('linking_invitations')
      .insert({
        patient_id: user.id,
        invitation_code: invitationCode,
        expires_at: expiresAt,
        status: 'pending',
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Database error', 
        details: insertError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('SUCCESS: Invitation created');
    return new Response(JSON.stringify({ 
      invitation_code: invitationCode, 
      expires_at: expiresAt 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({ 
      error: 'Internal error', 
      details: err.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}); 