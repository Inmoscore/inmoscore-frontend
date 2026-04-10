import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ================================
// NETWORK / ENV
// ================================

dns.setServers(['8.8.8.8', '8.8.4.4']);

const envPath = path.resolve(process.cwd(), '.env');
const envExists = fs.existsSync(envPath);
const envResult = dotenv.config({ path: envPath });

console.log('ENV PATH:', envPath);
console.log('ENV exists:', envExists);
console.log('DOTENV error:', envResult.error ? envResult.error.message : 'none');
console.log('DOTENV parsed keys:', envResult.parsed ? Object.keys(envResult.parsed) : []);

const {
  PORT = '3001',
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  console.error('❌ Error: faltan variables requeridas en backend/.env');
  console.error('Requeridas: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET');
  process.exit(1);
}

// ================================
// APP / CLIENTS
// ================================

const app = express();

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ================================
// TYPES
// ================================

interface JwtPayload {
  id: string;
  email: string;
  tipo_usuario: string;
}

interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ================================
// VALIDATIONS
// ================================

const registerSchema = z.object({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  phone: z.string().optional().nullable(),
  tipo_usuario: z.string().optional(),
}).refine((data) => Boolean(data.nombre || data.fullName), {
  message: 'El nombre es requerido',
  path: ['nombre'],
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// ================================
// MIDDLEWARES
// ================================

app.use(helmet());

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'https://inmoscore-frontend.vercel.app',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const isAllowedOrigin = allowedOrigins.includes(origin);
      const isVercelPreview = origin.endsWith('.vercel.app');

      if (isAllowedOrigin || isVercelPreview) {
        return callback(null, true);
      }

      console.warn(`❌ CORS bloqueó el origen: ${origin}`);
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas peticiones desde esta IP',
  },
});

app.use(limiter);

// ================================
// HELPERS
// ================================

function signToken(user: { id: string; email: string; tipo_usuario: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
    },
    JWT_SECRET as string,
    { expiresIn: '7d' }
  );
}

function calculateScore(reportes: number, procesos: number): number {
  let score = 100;
  score -= reportes * 20;
  score -= procesos * 30;
  return Math.max(0, score);
}

function getClasificacion(score: number): string {
  if (score >= 80) return 'bajo';
  if (score >= 50) return 'medio';
  return 'alto';
}

function isValidCedula(cedula: string): boolean {
  return /^\d{6,10}$/.test(cedula);
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

// ================================
// AUTH MIDDLEWARE
// ================================

function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Token no proporcionado',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({
      success: false,
      message: 'Token inválido',
    });
  }
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.tipo_usuario !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Acceso denegado',
    });
    return;
  }
  next();
}

// ================================
// HEALTH
// ================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      status: 'OK',
      message: 'InmoScore API conectada a Supabase',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      status: 'ERROR',
      message: 'Error conectando a Supabase',
      detail: error?.message ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
});

// ================================
// AUTH ROUTES
// ================================

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const nombre = String(parsed.data.nombre || parsed.data.fullName || '').trim();
    const email = String(parsed.data.email).trim().toLowerCase();
    const password = String(parsed.data.password);
    const tipo_usuario = String(parsed.data.tipo_usuario || 'propietario').trim();

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUserError) {
      console.error('Error verificando usuario existente:', existingUserError);
      res.status(500).json({
        success: false,
        message: 'Error verificando usuario existente',
      });
      return;
    }

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: 'El email ya está registrado',
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        nombre,
        email,
        password: hashedPassword,
        tipo_usuario,
        fecha_registro: new Date().toISOString(),
        email_verificado: false,
      })
      .select('id, nombre, email, tipo_usuario')
      .single();

    if (insertError || !newUser) {
      console.error('Error creando usuario:', insertError);
      res.status(500).json({
        success: false,
        message: 'No se pudo crear el usuario',
      });
      return;
    }

    const token = signToken({
      id: newUser.id,
      email: newUser.email,
      tipo_usuario: newUser.tipo_usuario,
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado correctamente',
      token,
      user: {
        id: newUser.id,
        nombre: newUser.nombre,
        fullName: newUser.nombre,
        email: newUser.email,
        tipo_usuario: newUser.tipo_usuario,
      },
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar usuario',
    });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Email y contraseña son requeridos',
      });
      return;
    }

    const cleanEmail = String(parsed.data.email).trim().toLowerCase();
    const plainPassword = String(parsed.data.password);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error || !user) {
      res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(plainPassword, user.password);

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
      return;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      tipo_usuario: user.tipo_usuario,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        fullName: user.nombre,
        email: user.email,
        tipo_usuario: user.tipo_usuario,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión',
    });
  }
});

// ================================
// TENANTS ROUTES
// ================================

app.get('/api/tenants/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { cedula } = req.query;

    if (!cedula || typeof cedula !== 'string') {
      res.status(400).json({
        success: false,
        message: 'La cédula es requerida',
      });
      return;
    }

    if (!isValidCedula(cedula)) {
      res.status(400).json({
        success: false,
        message: 'Formato de cédula inválido (6-10 dígitos)',
      });
      return;
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('cedula', cedula)
      .maybeSingle();

    if (tenantError) {
      throw tenantError;
    }

    if (!tenant) {
      res.json({
        success: true,
        cedula,
        nombre: null,
        score: null,
        clasificacion: null,
        total_reportes: 0,
        reportes_aprobados: 0,
        procesos_judiciales: 0,
        detalle_reportes: [],
        detalle_procesos: [],
      });
      return;
    }

    const { data: reportes, error: reportesError } = await supabase
      .from('reports')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('estado', 'aprobado')
      .order('fecha_reporte', { ascending: false });

    if (reportesError) {
      throw reportesError;
    }

    const { data: procesos, error: procesosError } = await supabase
      .from('legal_cases')
      .select('*')
      .eq('cedula', cedula);

    if (procesosError) {
      throw procesosError;
    }

    const totalReportes = reportes?.length || 0;
    const totalProcesos = procesos?.length || 0;
    const score = calculateScore(totalReportes, totalProcesos);
    const clasificacion = getClasificacion(score);

    res.json({
      success: true,
      cedula: tenant.cedula,
      nombre: tenant.nombre,
      score,
      clasificacion,
      total_reportes: totalReportes,
      reportes_aprobados: totalReportes,
      procesos_judiciales: totalProcesos,
      detalle_reportes: reportes || [],
      detalle_procesos: procesos || [],
    });
  } catch (error) {
    console.error('Error al buscar arrendatario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

app.get('/api/tenants/:cedula', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { cedula } = req.params;

    if (!cedula || !isValidCedula(String(cedula))) {
      res.status(400).json({
        success: false,
        message: 'Cédula inválida (6-10 dígitos)',
      });
      return;
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('cedula', cedula)
      .maybeSingle();

    if (tenantError) {
      throw tenantError;
    }

    if (!tenant) {
      res.status(404).json({
        success: false,
        message: 'Inquilino no encontrado',
      });
      return;
    }

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('fecha_reporte', { ascending: false });

    if (reportsError) {
      throw reportsError;
    }

    res.json({
      success: true,
      tenant,
      reports: reports || [],
    });
  } catch (error) {
    console.error('Error en búsqueda detalle:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// ================================
// REPORTS ROUTES
// ================================

app.post('/api/reports', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, cedula, telefono, ciudad, tipo_problema, descripcion } = req.body ?? {};

    if (!nombre || !cedula || !ciudad || !tipo_problema || !descripcion) {
      res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos',
      });
      return;
    }

    if (!isValidCedula(String(cedula))) {
      res.status(400).json({
        success: false,
        message: 'Cédula inválida (6-10 dígitos)',
      });
      return;
    }

    let { data: tenant, error: tenantLookupError } = await supabase
      .from('tenants')
      .select('id')
      .eq('cedula', String(cedula))
      .maybeSingle();

    if (tenantLookupError) {
      throw tenantLookupError;
    }

    if (!tenant) {
      const { data: newTenant, error: tenantInsertError } = await supabase
        .from('tenants')
        .insert({
          nombre: normalizeText(nombre),
          cedula: String(cedula).trim(),
          telefono: telefono ? String(telefono).trim() : null,
          ciudad: normalizeText(ciudad),
          fecha_creacion: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (tenantInsertError || !newTenant) {
        throw tenantInsertError || new Error('No se pudo crear el arrendatario');
      }

      tenant = newTenant;
    }

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        tenant_id: tenant.id,
        tipo_problema: String(tipo_problema).trim(),
        descripcion: String(descripcion).trim(),
        fecha_reporte: new Date().toISOString(),
        estado: 'pendiente',
        reportado_por: req.user?.id || null,
      })
      .select('*')
      .single();

    if (reportError || !report) {
      throw reportError || new Error('No se pudo crear el reporte');
    }

    res.status(201).json({
      success: true,
      message: 'Reporte creado exitosamente y pendiente de revisión',
      report,
    });
  } catch (error) {
    console.error('Error al crear reporte:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
});

// ================================
// ADMIN ROUTES
// ================================

app.get(
  '/api/admin/reports',
  authenticateToken,
  requireAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const { data: reports, error } = await supabase
        .from('reports')
        .select(`
          *,
          tenants (
            nombre,
            cedula,
            ciudad
          )
        `)
        .eq('estado', 'pendiente')
        .order('fecha_reporte', { ascending: false });

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        reports: reports || [],
      });
    } catch (error) {
      console.error('Error al obtener reportes admin:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

app.put(
  '/api/admin/reports/:id',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { estado } = req.body ?? {};

      if (!['aprobado', 'rechazado'].includes(String(estado))) {
        res.status(400).json({
          success: false,
          message: 'Estado inválido',
        });
        return;
      }

      const { data: report, error } = await supabase
        .from('reports')
        .update({ estado })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !report) {
        throw error || new Error('No se pudo actualizar el reporte');
      }

      res.json({
        success: true,
        message: `Reporte ${estado === 'aprobado' ? 'aprobado' : 'rechazado'} exitosamente`,
        report,
      });
    } catch (error) {
      console.error('Error al actualizar reporte:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno',
      });
    }
  }
);

// ================================
// 404 / ERROR HANDLERS
// ================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
    path: req.path,
  });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
  });
});

// ================================
// SERVER START
// ================================

app.listen(Number(PORT), async () => {
  console.log(`🚀 Servidor InmoScore corriendo en puerto ${PORT}`);

  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Conexión a Supabase establecida');
  } catch (err) {
    console.error('❌ Error conectando a Supabase:', err);
  }
});