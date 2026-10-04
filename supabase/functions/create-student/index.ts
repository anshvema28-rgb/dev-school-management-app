// supabase/functions/create-student/index.ts
// Secure Student Account Creation — Supabase Edge Function (Deno).
//
// SECURITY:
// - The service_role key is used ONLY here, server-side. It is never exposed
//   to the Expo/React Native app.
// - Admin status is determined from the authenticated user's profile in the
//   database — never from client-supplied input.
// - The password is never returned in the response.
// - If any DB step fails after Auth creation, the auth user is deleted so no
//   orphan account is left behind.
//
// Deploy: supabase functions deploy create-student
// Set secrets: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const token = authHeader.replace('Bearer ', '')

    // Client bound to the caller's token (verify identity + admin role)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 2. Verify the caller is authenticated
    const { data: { user }, error: authError } = await userClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Determine admin status from the DATABASE (never trust client input)
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Parse + validate body
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      email,
      password,
      full_name,
      phone,
      class_id,
      roll_no,
      admission_no,
      date_of_birth,
      gender,
      address,
      parent_name,
      parent_phone,
    } = body

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'A valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return new Response(
        JSON.stringify({ error: 'full_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Service-role client (server-side only)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 6. Create the Auth user
    const { data: authData, error: createError } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    })

    if (createError || !authData.user) {
      return new Response(
        JSON.stringify({ error: createError ? createError.message : 'Failed to create auth user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const authUser = authData.user

    // 7. Create / update the profiles row (role = student)
    const { error: profileError2 } = await admin.from('profiles').upsert({
      id: authUser.id,
      role: 'student',
      full_name: full_name.trim(),
      email: email.trim(),
      phone: phone ? String(phone) : null,
    })

    if (profileError2) {
      await admin.auth.admin.deleteUser(authUser.id) // roll back auth user
      return new Response(
        JSON.stringify({ error: 'Failed to create profile: ' + profileError2.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Create the students row
    const { error: studentError } = await admin.from('students').insert({
      user_id: authUser.id,
      profile_id: authUser.id,
      class_id: class_id ? String(class_id) : null,
      roll_no: roll_no ? String(roll_no) : null,
      admission_no: admission_no ? String(admission_no) : null,
      date_of_birth: date_of_birth ? String(date_of_birth) : null,
      gender: gender ? String(gender) : null,
      address: address ? String(address) : null,
      parent_name: parent_name ? String(parent_name) : null,
      parent_phone: parent_phone ? String(parent_phone) : null,
    })

    if (studentError) {
      await admin.auth.admin.deleteUser(authUser.id) // roll back auth user
      return new Response(
        JSON.stringify({ error: 'Failed to create student record: ' + studentError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 9. Return safe information only (never the password)
    return new Response(
      JSON.stringify({
        id: authUser.id,
        email: authUser.email,
        full_name: full_name.trim(),
        phone: phone ? String(phone) : null,
        class_id: class_id ? String(class_id) : null,
        roll_no: roll_no ? String(roll_no) : null,
        admission_no: admission_no ? String(admission_no) : null,
        date_of_birth: date_of_birth ? String(date_of_birth) : null,
        gender: gender ? String(gender) : null,
        parent_name: parent_name ? String(parent_name) : null,
        parent_phone: parent_phone ? String(parent_phone) : null,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
