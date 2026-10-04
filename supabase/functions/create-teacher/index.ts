// supabase/functions/create-teacher/index.ts
// Secure Teacher Account Creation — Supabase Edge Function (Deno).
//
// SECURITY:
// - The service_role key is used ONLY here, server-side. It is never exposed
//   to the Expo/React Native app.
// - Admin status is determined from the authenticated user's profile in the
//   database — never from client-supplied input.
// - The password is never returned in the response.
//
// Deploy: supabase functions deploy create-teacher
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

    // Client bound to the caller's token (used to verify identity + admin role)
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
      console.log(
        '[create-teacher] admin check failed:',
        profileError ? profileError.message : 'role is not admin'
      )
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('[create-teacher] step reached: admin verified')

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
      specialization,
      qualifications,
      hire_date,
      status,
      assigned_class_id,
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
    // Booleans only — never the values themselves.
    console.log(
      '[create-teacher] env present: SUPABASE_URL=' +
        String(!!Deno.env.get('SUPABASE_URL')) +
        ' SUPABASE_ANON_KEY=' +
        String(!!Deno.env.get('SUPABASE_ANON_KEY')) +
        ' SUPABASE_SERVICE_ROLE_KEY=' +
        String(!!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    )
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
      console.log(
        '[create-teacher] auth user creation failed:',
        createError ? createError.message : 'no user returned'
      )
      return new Response(
        JSON.stringify({ error: createError ? createError.message : 'Failed to create auth user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const authUser = authData.user
    console.log('[create-teacher] step reached: auth user created')

    // 7. Create / update the profiles row (role = teacher)
    const { error: profileError2 } = await admin.from('profiles').upsert({
      id: authUser.id,
      role: 'teacher',
      full_name: full_name.trim(),
      email: email.trim(),
      phone: phone ? String(phone) : null,
    })

    if (profileError2) {
      console.log('[create-teacher] profiles upsert failed:', profileError2.message)
      await admin.auth.admin.deleteUser(authUser.id) // roll back auth user
      return new Response(
        JSON.stringify({ error: 'Failed to create profile: ' + profileError2.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Create the teachers row
    // teachers.hire_date is NOT NULL (001_initial_schema.sql), so fall back to
    // today when the admin leaves the field blank instead of inserting NULL.
    const hireDateValue = hire_date
      ? String(hire_date)
      : new Date().toISOString().slice(0, 10)

    const { error: teacherError } = await admin.from('teachers').insert({
      profile_id: authUser.id,
      specialization: specialization ? String(specialization) : null,
      qualifications: qualifications ? String(qualifications) : null,
      hire_date: hireDateValue,
      status: status ? String(status) : 'active',
    })

    if (teacherError) {
      console.log('[create-teacher] teachers insert failed:', teacherError.message)
      await admin.auth.admin.deleteUser(authUser.id) // roll back auth user
      return new Response(
        JSON.stringify({ error: 'Failed to create teacher record: ' + teacherError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 9. Assign homeroom class if provided
    if (assigned_class_id) {
      await admin
        .from('classes')
        .update({ homeroom_teacher_id: authUser.id })
        .eq('id', assigned_class_id)
    }

    // 10. Return safe information only (never the password)
    console.log('[create-teacher] completed successfully')
    return new Response(
      JSON.stringify({
        id: authUser.id,
        email: authUser.email,
        full_name: full_name.trim(),
        phone: phone ? String(phone) : null,
        specialization: specialization ? String(specialization) : null,
        qualifications: qualifications ? String(qualifications) : null,
        hire_date: hireDateValue,
        status: status ? String(status) : 'active',
        assigned_class_id: assigned_class_id ? String(assigned_class_id) : null,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.log(
      '[create-teacher] unexpected error:',
      err instanceof Error ? err.message : String(err)
    )
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
