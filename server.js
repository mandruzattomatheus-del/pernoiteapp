require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ============== Banco de dados (SQLite) ==============
try {
  const dbDir = path.join(__dirname, 'db');
  if (!fs.existsSync(dbDir)) {
    console.log('[DB] Pasta db/ não existia; criando...');
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'registros.db');
  console.log('[DB] Abrindo/criando banco:', dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const schemaPath = path.join(dbDir, 'schema.sql');
  console.log('[DB] Procurando schema em:', schemaPath);

  if (!fs.existsSync(schemaPath)) {
    console.error('[DB][ERRO] Arquivo db/schema.sql não encontrado. Verifique o caminho e o nome do arquivo.');
    process.exit(1);
  }

  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
  console.log('[DB] Aplicando schema...');
  db.exec(schemaSQL);
  console.log('[DB] Schema aplicado com sucesso.');

  // Expor "db" para os handlers
  app.locals.db = db;
} catch (e) {
  console.error('[DB][FATAL] Falha ao iniciar banco:', e);
  process.exit(1);
}

// ===== Helpers =====
const JORNADA_EFETIVA_MIN = 8 * 60 + 45; // 8h45 = 525 min
const ALMOCO_MIN = 60;

function hhmmToMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function bool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['1','true','on','yes','y','sim','s'].includes(s);
}
function extractOnlyPlate(s) {
  if (!s) return null;
  return String(s).split(' - ')[0].trim().toUpperCase();
}

// ===== Healthcheck =====
app.get('/health', (_req, res) => res.json({ ok: true }));

// ===== Inserção =====
app.post('/api/registro', (req, res) => {
  const db = req.app.locals.db;
  try {
    const b = req.body || {};
    const funcao = String(b.funcao_usuario || '').trim().toLowerCase();
    if (!['motorista','ajudante'].includes(funcao)) {
      return res.status(400).json({ error: 'Função inválida.' });
    }

    const nome_colaborador =
      funcao === 'motorista'
        ? String(b.nome_motorista || '').trim()
        : String(b.nome_ajudante || '').trim();

    if (!nome_colaborador) {
      return res.status(400).json({ error: 'Selecione o nome do colaborador.' });
    }

    const data_registro = String(b.data_registro || '').trim();
    const hora_entrada = String(b.hora_entrada || '').trim();
    const hora_saida   = String(b.hora_saida   || '').trim();
    const romaneio     = String(b.romaneio     || '').trim();
    const uf           = String(b.uf           || '').trim();
    const cidade       = String(b.cidade       || '').trim();

    if (!data_registro || !hora_entrada || !hora_saida || !romaneio || !uf || !cidade) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes (data, horários, romaneio, UF, cidade).' });
    }

    const placaOnly = extractOnlyPlate(String(b.placa || ''));
    if (!placaOnly) {
      return res.status(400).json({ error: 'Selecione o veículo/placa.' });
    }

    const pernoite = bool(b.pernoite);
    const vale_descarga = bool(b.vale_descarga);

    // Cálculos
    const minEntrada = hhmmToMin(hora_entrada);
    const minSaida   = hhmmToMin(hora_saida);
    if (minEntrada == null || minSaida == null || minSaida <= minEntrada) {
      return res.status(400).json({ error: 'Horários inválidos.' });
    }

    const horas_trabalhadas_min = Math.max(0, (minSaida - minEntrada) - ALMOCO_MIN);
    const horas_extras_min = Math.max(0, horas_trabalhadas_min - JORNADA_EFETIVA_MIN);

    // Valores padrão
    const VALOR_PERNOITE_PADRAO = Number(process.env.VALOR_PERNOITE_PADRAO || 50);
    const VALOR_VALE_PADRAO     = Number(process.env.VALOR_VALE_PADRAO     || 100);

    const valor_pernoite = pernoite ? VALOR_PERNOITE_PADRAO : null;
    const valor_vale_descarga = vale_descarga ? VALOR_VALE_PADRAO : null;

    const insert = db.prepare(`
      INSERT INTO registro (
        nome_colaborador, funcao,
        data_registro, hora_entrada, hora_saida,
        horas_trabalhadas_min, horas_extras_min,
        romaneio, uf, cidade,
        placa,
        pernoite, valor_pernoite,
        vale_descarga, valor_vale_descarga,
        visto_fiscal
      ) VALUES (
        @nome_colaborador, @funcao,
        @data_registro, @hora_entrada, @hora_saida,
        @horas_trabalhadas_min, @horas_extras_min,
        @romaneio, @uf, @cidade,
        @placa,
        @pernoite, @valor_pernoite,
        @vale_descarga, @valor_vale_descarga,
        @visto_fiscal
      )
    `);

    const result = insert.run({
      nome_colaborador,
      funcao,
      data_registro,
      hora_entrada,
      hora_saida,
      horas_trabalhadas_min,
      horas_extras_min,
      romaneio,
      uf,
      cidade,
      placa: placaOnly,
      pernoite: pernoite ? 1 : 0,
      valor_pernoite,
      vale_descarga: vale_descarga ? 1 : 0,
      valor_vale_descarga,
      visto_fiscal: '' // sempre vazio
    });

    return res.status(201).json({
      ok: true,
      id: result.lastInsertRowid,
      horas_trabalhadas_min,
      horas_extras_min
    });
  } catch (err) {
    console.error('POST /api/registro erro:', err);
    return res.status(500).json({ error: 'Falha ao salvar registro.' });
  }
});

// ===== Listagens de conferência =====
app.get('/api/horas-extras', (req, res) => {
  const db = req.app.locals.db;
  try {
    const rows = db.prepare(
      `SELECT * FROM vw_holerite_horas_extras ORDER BY _data DESC, _criado_em DESC`
    ).all();
    res.json(rows);
  } catch (e) {
    console.error('GET /api/horas-extras erro:', e);
    res.status(500).json({ error: 'Falha ao listar.' });
  }
});

// ===================== Exportação Excel =====================
const XLSX = require('xlsx');
const os = require('os');

// Mapeia view e coluna de nome do arquivo por tipo
const VIEW_BY_TIPO = {
  'horas-extras':  { view: 'vw_holerite_horas_extras',  sheet: 'horas_extras' },
  'pernoites':     { view: 'vw_holerite_pernoites',     sheet: 'pernoites' },
  'vale-descarga': { view: 'vw_holerite_vale_descarga', sheet: 'vale_descarga' },
};

// Utilitário simples p/ montar nome de arquivo
function buildFilename(tipo, di, df) {
  const range = (di && df) ? `${di}_a_${df}` : (di || df || new Date().toISOString().slice(0,10));
  return `relatorio_${tipo}_${range}.xlsx`;
}

// Transforma linhas (JSON) em planilha
function buildWorkbook(rows, sheetName) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

/**
 * POST /api/exportar
 * body: { tipo: 'horas-extras'|'pernoites'|'vale-descarga', dataInicio?: 'YYYY-MM-DD', dataFim?: 'YYYY-MM-DD' }
 * retorno: o arquivo .xlsx como download
 */
app.post('/api/exportar', (req, res) => {
  const db = req.app.locals.db;
  try {
    const { tipo, dataInicio, dataFim } = req.body || {};
    const cfg = VIEW_BY_TIPO[tipo];
    if (!cfg) return res.status(400).json({ error: 'Tipo inválido.' });

    let where = '';
    const params = {};
    if (dataInicio && dataFim) {
      where = 'WHERE date(_data) BETWEEN @di AND @df';
      params.di = dataInicio;
      params.df = dataFim;
    } else if (dataInicio) {
      where = 'WHERE date(_data) >= @di';
      params.di = dataInicio;
    } else if (dataFim) {
      where = 'WHERE date(_data) <= @df';
      params.df = dataFim;
    }

    const sql = `SELECT * FROM ${cfg.view} ${where} ORDER BY _data ASC`;
    const rows = db.prepare(sql).all(params);

    // Gera workbook
    const wb = buildWorkbook(rows, cfg.sheet);

    // Salva em memória e envia como download
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = buildFilename(tipo, dataInicio, dataFim);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (e) {
    console.error('POST /api/exportar erro:', e);
    res.status(500).json({ error: 'Falha ao exportar.' });
  }
});

/**
 * POST /api/exportar-email
 * body: { tipo, dataInicio?, dataFim?, paraEmail }
 * retorno: { ok: true }
 * (opcional — use quando quiser habilitar envio por e‑mail)
 */
app.post('/api/exportar-email', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { tipo, dataInicio, dataFim, paraEmail } = req.body || {};
    const cfg = VIEW_BY_TIPO[tipo];
    if (!cfg) return res.status(400).json({ error: 'Tipo inválido.' });
    if (!paraEmail) return res.status(400).json({ error: 'Informe paraEmail.' });

    let where = '';
    const params = {};
    if (dataInicio && dataFim) {
      where = 'WHERE date(_data) BETWEEN @di AND @df';
      params.di = dataInicio;
      params.df = dataFim;
    } else if (dataInicio) {
      where = 'WHERE date(_data) >= @di';
      params.di = dataInicio;
    } else if (dataFim) {
      where = 'WHERE date(_data) <= @df';
      params.df = dataFim;
    }

    const sql = `SELECT * FROM ${cfg.view} ${where} ORDER BY _data ASC`;
    const rows = db.prepare(sql).all(params);

    const wb = buildWorkbook(rows, cfg.sheet);
    const tmp = path.join(os.tmpdir(), buildFilename(tipo, dataInicio, dataFim));
    XLSX.writeFile(wb, tmp);

    // Envia por e-mail (configurar SMTP mais tarde, quando quiser)
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@mercam.local',
      to: paraEmail,
      subject: `Relatório ${tipo} ${dataInicio || ''}${dataFim ? ' a ' + dataFim : ''}`,
      text: `Segue anexo o relatório de ${tipo}.`,
      attachments: [{ filename: path.basename(tmp), path: tmp }]
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/exportar-email erro:', e);
    res.status(500).json({ error: 'Falha ao exportar/enviar.' });
  }
});

app.get('/api/pernoites', (req, res) => {
  const db = req.app.locals.db;
  try {
    const rows = db.prepare(
      `SELECT * FROM vw_holerite_pernoites ORDER BY _data DESC`
    ).all();
    res.json(rows);
  } catch (e) {
    console.error('GET /api/pernoites erro:', e);
    res.status(500).json({ error: 'Falha ao listar.' });
  }
});

app.get('/api/vale-descarga', (req, res) => {
  const db = req.app.locals.db;
  try {
    const rows = db.prepare(
      `SELECT * FROM vw_holerite_vale_descarga ORDER BY _data DESC`
    ).all();
    res.json(rows);
  } catch (e) {
    console.error('GET /api/vale-descarga erro:', e);
    res.status(500).json({ error: 'Falha ao listar.' });
  }
});

// ====== TESTE DE E-MAIL (Gmail via SMTP) ======
const nodemailer = require('nodemailer');

function buildTransport() {
  // Usa as variáveis padronizadas (SMTP_*)
  // Você também poderia usar process.env.EMAIL_USER/PASS diretamente
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, // TLS via 587
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
    }
  });
}

/**
 * POST /api/test-email
 * body: { to?: string, subject?: string, text?: string }
 * Se "to" não vier, usa MAIL_TO_VICTOR (.env)
 */
app.post('/api/test-email', async (req, res) => {
  try {
    const to = (req.body?.to || process.env.MAIL_TO_VICTOR || process.env.EMAIL_EMPRESA || process.env.SMTP_USER);
    const subject = req.body?.subject || 'Teste de e-mail - PernoiteApp';
    const text = req.body?.text || 'E-mail de teste enviado com sucesso via Gmail SMTP.';

    const transporter = buildTransport();

    // Testa conexão/autenticação primeiro (opcional, ajuda no diagnóstico)
    await transporter.verify();

    await transporter.sendMail({
      from: process.env.MAIL_FROM || `PernoiteApp <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to,
      subject,
      text
    });

    res.json({ ok: true, to, subject });
  } catch (err) {
    console.error('[MAIL][ERRO]', err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`Servidor ON: http://localhost:${PORT}`);
});