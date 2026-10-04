// supabase/functions/create-parent/index.ts
// Secure Parent Account Creation — Supabase Edge Function (Deno).
//
// SECURITY:
// - The service_role key is used ONLY here, server-side. Never exposed to Expo.
// - Admin status is determined from the authenticated user's profile in the
//   database — never from client-supplied input.
// - The password is never returned in the response.
// - If any DB step fails after Auth creation, the auth user is deleted so no
//   orphan account is left behind.
//
// Deploy: supabase functions deploy create-parent
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

    const { email, password, full_name, phone, relationship, student_ids } = body

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
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one student must be selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Service-role client (server-side only)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 6. Verify every selected student exists
    const { data: validStudents, error: studentCheckErr } = await admin
      .from('students')
      .select('id')
      .in('id', student_ids)

    if (studentCheckErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to verify students: ' + studentCheckErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!validStudents || validStudents.length !== student_ids.length) {
      return new Response(
        JSON.stringify({ error: 'One or more selected students do not exist' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Create the Auth user
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

    // 8. Create / update the profiles row (role = parent)
    const { error: profileError2 } = await admin.from('profiles').upsert({
      id: authUser.id,
      role: 'parent',
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

    // 9. Create the parent_students relationship rows
    const rows = student_ids.map((sid: string) => ({
      parent_id: authUser.id,
      student_id: String(sid),
      relationship: relationship ? String(relationship) : null,
    }))

    const { error: relError } = await admin.from('parent_students').insert(rows)

    if (relError) {
      await admin.auth.admin.deleteUser(authUser.id) // roll back auth user
      return new Response(
        JSON.stringify({ error: 'Failed to link students: ' + relError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 10. Return safe information only (never the password)
    return new Response(
      JSON.stringify({
        id: authUser.id,
        email: authUser.email,
        full_name: full_name.trim(),
        phone: phone ? String(phone) : null,
        relationship: relationship ? String(relationship) : null,
        student_ids: student_ids.map((s: string) => String(s)),
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
