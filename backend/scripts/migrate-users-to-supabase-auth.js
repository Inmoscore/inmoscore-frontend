require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const temporaryPassword = () => `Tmp-${Math.random().toString(36).slice(2)}A9!`;

const loadAllAuthUsers = async () => {
  const emails = new Set();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) throw error;
    const users = data.users || [];
    if (users.length === 0) break;

    for (const user of users) {
      if (user.email) emails.add(user.email.toLowerCase());
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return emails;
};

const run = async () => {
  const { data: legacyUsers, error } = await supabase
    .from('users')
    .select('id, nombre, email, tipo_usuario');

  if (error) throw error;

  const authEmails = await loadAllAuthUsers();
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of legacyUsers || []) {
    const email = (user.email || '').toLowerCase();
    if (!email) {
      skipped += 1;
      continue;
    }

    if (authEmails.has(email)) {
      skipped += 1;
      continue;
    }

    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword(),
      email_confirm: true,
      user_metadata: {
        legacy_user_id: user.id,
        nombre: user.nombre,
        tipo_usuario: user.tipo_usuario
      }
    });

    if (createError) {
      failed += 1;
      console.error(`Error creando usuario auth ${email}:`, createError.message);
      continue;
    }

    created += 1;
    authEmails.add(email);
  }

  console.log('Migración finalizada');
  console.log(`- creados: ${created}`);
  console.log(`- existentes/omitidos: ${skipped}`);
  console.log(`- fallidos: ${failed}`);
  console.log('Acción posterior recomendada: forzar reset de contraseña para usuarios migrados masivamente.');
};

run().catch((err) => {
  console.error('Fallo en migración de usuarios:', err);
  process.exit(1);
});
