require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');
const { enqueueEmail, processQueue } = require('./emailQueue');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

try {
  const dbDir = path.join(__dirname, 'db');
  if (!fs.existsSync(dbDir)) { fs.mkdirSync(dbDir, { recursive: true }); }
  const dbPath = path.join(dbDir, 'registros.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const schemaSQL = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8');
  db.exec(schemaSQL);
  app.locals.db = db;
} catch (e) {
  console.error('[DB][FATAL] Falha ao iniciar banco:', e);
  process.exit(1);
}

const JORNADA_EFETIVA_MIN = 8 * 60 + 45;
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
function minToHHMM(min) {
  if (!min && min !== 0) return '00:00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const nodemailer = require('nodemailer');
function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
    }
  });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/registro', async (req, res) => {
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

    // Busca email do colaborador no banco pelo nome
    const colabDb = db.prepare(`SELECT email FROM colaboradores WHERE nome_completo = ? AND ativo = 1`).get(nome_colaborador);
    const email = colabDb?.email || '';

    const data_registro = String(b.data_registro || '').trim();
    const hora_entrada  = String(b.hora_entrada  || '').trim();
    const hora_saida    = String(b.hora_saida    || '').trim();
    const romaneio      = String(b.romaneio      || '').trim();
    const uf            = String(b.uf            || '').trim();
    const cidade        = String(b.cidade        || '').trim();

    if (!data_registro || !hora_entrada || !hora_saida || !romaneio || !uf || !cidade) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const duplicado = db.prepare(`
      SELECT id FROM registro
      WHERE nome_colaborador = @nome AND data_registro = @data AND romaneio = @romaneio
    `).get({ nome: nome_colaborador, data: data_registro, romaneio });

    if (duplicado && !bool(b.confirmar_duplicado)) {
      return res.status(409).json({
        duplicado: true,
        warning: `Já existe um registro para ${nome_colaborador} na data ${data_registro} com o romaneio ${romaneio}. Deseja enviar mesmo assim?`
      });
    }

    const placaOnly = extractOnlyPlate(String(b.placa || ''));
    if (!placaOnly) return res.status(400).json({ error: 'Selecione o veículo/placa.' });

    const pernoite      = bool(b.pernoite);
    const vale_descarga = bool(b.vale_descarga);

    const minEntrada = hhmmToMin(hora_entrada);
    const minSaida   = hhmmToMin(hora_saida);
    if (minEntrada == null || minSaida == null || minSaida <= minEntrada) {
      return res.status(400).json({ error: 'Horários inválidos.' });
    }

    const horas_trabalhadas_min = Math.max(0, (minSaida - minEntrada) - ALMOCO_MIN);
    const horas_extras_min      = Math.max(0, horas_trabalhadas_min - JORNADA_EFETIVA_MIN);

    const VALOR_PERNOITE_PADRAO = Number(process.env.VALOR_PERNOITE_PADRAO || 50);
    const VALOR_VALE_PADRAO     = Number(process.env.VALOR_VALE_PADRAO     || 100);

    const valor_pernoite      = pernoite      ? VALOR_PERNOITE_PADRAO : null;
    const valor_vale_descarga = vale_descarga ? VALOR_VALE_PADRAO     : null;

    const result = db.prepare(`
      INSERT INTO registro (
        nome_colaborador, funcao, email,
        data_registro, hora_entrada, hora_saida,
        horas_trabalhadas_min, horas_extras_min,
        romaneio, uf, cidade, placa,
        pernoite, valor_pernoite,
        vale_descarga, valor_vale_descarga,
        visto_fiscal
      ) VALUES (
        @nome_colaborador, @funcao, @email,
        @data_registro, @hora_entrada, @hora_saida,
        @horas_trabalhadas_min, @horas_extras_min,
        @romaneio, @uf, @cidade, @placa,
        @pernoite, @valor_pernoite,
        @vale_descarga, @valor_vale_descarga,
        @visto_fiscal
      )
    `).run({
      nome_colaborador, funcao, email,
      data_registro, hora_entrada, hora_saida,
      horas_trabalhadas_min, horas_extras_min,
      romaneio, uf, cidade,
      placa: placaOnly,
      pernoite:      pernoite      ? 1 : 0,
      valor_pernoite,
      vale_descarga: vale_descarga ? 1 : 0,
      valor_vale_descarga,
      visto_fiscal: ''
    });

    if (email) {
      try {
        enqueueEmail(db, {
          tipo: 'confirmacao',
          para: email,
          assunto: `Confirmação de Registro - ${data_registro}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#333;">Registro recebido com sucesso!</h2>
              <p>Olá, <strong>${nome_colaborador}</strong>! Seu registro foi enviado corretamente.</p>
              <br/>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr style="background:#f5f5f5;"><td style="padding:8px;border:1px solid #ddd"><strong>Data</strong></td><td style="padding:8px;border:1px solid #ddd">${data_registro}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Função</strong></td><td style="padding:8px;border:1px solid #ddd">${funcao}</td></tr>
                <tr style="background:#f5f5f5;"><td style="padding:8px;border:1px solid #ddd"><strong>Entrada</strong></td><td style="padding:8px;border:1px solid #ddd">${hora_entrada}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Saída</strong></td><td style="padding:8px;border:1px solid #ddd">${hora_saida}</td></tr>
                <tr style="background:#f5f5f5;"><td style="padding:8px;border:1px solid #ddd"><strong>Horas Trabalhadas</strong></td><td style="padding:8px;border:1px solid #ddd">${minToHHMM(horas_trabalhadas_min)}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Horas Extras</strong></td><td style="padding:8px;border:1px solid #ddd">${minToHHMM(horas_extras_min)}</td></tr>
                <tr style="background:#f5f5f5;"><td style="padding:8px;border:1px solid #ddd"><strong>Placa</strong></td><td style="padding:8px;border:1px solid #ddd">${placaOnly}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Romaneio / OC</strong></td><td style="padding:8px;border:1px solid #ddd">${romaneio}</td></tr>
                <tr style="background:#f5f5f5;"><td style="padding:8px;border:1px solid #ddd"><strong>UF</strong></td><td style="padding:8px;border:1px solid #ddd">${uf}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Cidade</strong></td><td style="padding:8px;border:1px solid #ddd">${cidade}</td></tr>
                <tr style="background:#f5f5f5;"><td style="padding:8px;border:1px solid #ddd"><strong>Pernoite</strong></td><td style="padding:8px;border:1px solid #ddd">${pernoite ? 'Sim - R$ ' + VALOR_PERNOITE_PADRAO.toFixed(2) : 'Não'}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Vale Descarga</strong></td><td style="padding:8px;border:1px solid #ddd">${vale_descarga ? 'Sim - R$ ' + VALOR_VALE_PADRAO.toFixed(2) : 'Não'}</td></tr>
              </table>
              <br/>
              <p style="color:#888;font-size:12px">Este é um e-mail automático, não responda.</p>
            </div>
          `
        });
        processQueue(db).catch(err => console.error('[QUEUE] Erro ao processar fila:', err));
      } catch (mailErr) {
        console.error('[QUEUE] Falha ao enfileirar confirmação:', mailErr.message);
      }
    }

    return res.status(201).json({ ok: true, id: result.lastInsertRowid, horas_trabalhadas_min, horas_extras_min });

  } catch (err) {
    console.error('POST /api/registro erro:', err);
    return res.status(500).json({ error: 'Falha ao salvar registro.' });
  }
});

app.get('/api/horas-extras', (req, res) => {
  const db = req.app.locals.db;
  try { res.json(db.prepare(`SELECT * FROM vw_holerite_horas_extras ORDER BY _data DESC, _criado_em DESC`).all()); }
  catch (e) { res.status(500).json({ error: 'Falha ao listar.' }); }
});

app.get('/api/pernoites', (req, res) => {
  const db = req.app.locals.db;
  try { res.json(db.prepare(`SELECT * FROM vw_holerite_pernoites ORDER BY _data DESC`).all()); }
  catch (e) { res.status(500).json({ error: 'Falha ao listar.' }); }
});

app.get('/api/vale-descarga', (req, res) => {
  const db = req.app.locals.db;
  try { res.json(db.prepare(`SELECT * FROM vw_holerite_vale_descarga ORDER BY _data DESC`).all()); }
  catch (e) { res.status(500).json({ error: 'Falha ao listar.' }); }
});

const XLSX = require('xlsx');
const os   = require('os');

const VIEW_BY_TIPO = {
  'horas-extras':  { view: 'vw_holerite_horas_extras',  sheet: 'horas_extras'  },
  'pernoites':     { view: 'vw_holerite_pernoites',     sheet: 'pernoites'     },
  'vale-descarga': { view: 'vw_holerite_vale_descarga', sheet: 'vale_descarga' },
};

function buildFilename(tipo, di, df) {
  const range = (di && df) ? `${di}_a_${df}` : (di || df || new Date().toISOString().slice(0,10));
  return `relatorio_${tipo}_${range}.xlsx`;
}
function buildWorkbook(rows, sheetName) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
  return wb;
}

app.post('/api/exportar', (req, res) => {
  const db = req.app.locals.db;
  try {
    const { tipo, dataInicio, dataFim } = req.body || {};
    const cfg = VIEW_BY_TIPO[tipo];
    if (!cfg) return res.status(400).json({ error: 'Tipo inválido.' });
    let where = ''; const params = {};
    if (dataInicio && dataFim) { where = 'WHERE date(_data) BETWEEN @di AND @df'; params.di = dataInicio; params.df = dataFim; }
    else if (dataInicio)       { where = 'WHERE date(_data) >= @di';               params.di = dataInicio; }
    else if (dataFim)          { where = 'WHERE date(_data) <= @df';               params.df = dataFim; }
    const rows = db.prepare(`SELECT * FROM ${cfg.view} ${where} ORDER BY _data ASC`).all(params);
    const buf  = XLSX.write(buildWorkbook(rows, cfg.sheet), { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${buildFilename(tipo, dataInicio, dataFim)}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (e) { res.status(500).json({ error: 'Falha ao exportar.' }); }
});

app.post('/api/exportar-email', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { tipo, dataInicio, dataFim, paraEmail } = req.body || {};
    const cfg = VIEW_BY_TIPO[tipo];
    if (!cfg)       return res.status(400).json({ error: 'Tipo inválido.' });
    if (!paraEmail) return res.status(400).json({ error: 'Informe paraEmail.' });
    let where = ''; const params = {};
    if (dataInicio && dataFim) { where = 'WHERE date(_data) BETWEEN @di AND @df'; params.di = dataInicio; params.df = dataFim; }
    else if (dataInicio)       { where = 'WHERE date(_data) >= @di';               params.di = dataInicio; }
    else if (dataFim)          { where = 'WHERE date(_data) <= @df';               params.df = dataFim; }
    const rows = db.prepare(`SELECT * FROM ${cfg.view} ${where} ORDER BY _data ASC`).all(params);
    const tmp  = path.join(os.tmpdir(), buildFilename(tipo, dataInicio, dataFim));
    XLSX.writeFile(buildWorkbook(rows, cfg.sheet), tmp);
    await buildTransport().sendMail({
      from: process.env.MAIL_FROM || 'no-reply@mercam.local',
      to: paraEmail,
      subject: `Relatório ${tipo} ${dataInicio || ''}${dataFim ? ' a ' + dataFim : ''}`,
      text: `Segue anexo o relatório de ${tipo}.`,
      attachments: [{ filename: path.basename(tmp), path: tmp }]
    });
    return res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Falha ao exportar/enviar.' }); }
});

app.post('/api/test-email', async (req, res) => {
  try {
    const to      = req.body?.to || process.env.MAIL_TO_VICTOR || process.env.SMTP_USER;
    const subject = req.body?.subject || 'Teste de e-mail - PernoiteApp';
    const text    = req.body?.text    || 'E-mail de teste enviado com sucesso via Gmail SMTP.';
    const transporter = buildTransport();
    await transporter.verify();
    await transporter.sendMail({ from: process.env.MAIL_FROM || `PernoiteApp <${process.env.SMTP_USER}>`, to, subject, text });
    res.json({ ok: true, to, subject });
  } catch (err) { res.status(500).json({ ok: false, error: String(err.message || err) }); }
});

const { gerarPdfPernoites, gerarPdfValeDescarga, gerarPdfHorasExtras } = require('./gerarPdf');

app.post('/api/gerar-pdf', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { tipo, ano, mes, colaborador } = req.body || {};
    if (!tipo || !ano || !mes || !colaborador) return res.status(400).json({ error: 'Informe tipo, ano, mes e colaborador.' });
    const anoN = parseInt(ano, 10); const mesN = parseInt(mes, 10);
    const di = `${anoN}-${String(mesN).padStart(2,'0')}-01`;
    const df = `${anoN}-${String(mesN).padStart(2,'0')}-31`;
    let pdfBuffer, filename;
    if (tipo === 'pernoites') {
      const rows = db.prepare(`SELECT * FROM vw_holerite_pernoites WHERE _colaborador = @colaborador AND date(_data) BETWEEN @di AND @df ORDER BY _data ASC`).all({ colaborador, di, df });
      pdfBuffer = await gerarPdfPernoites({ ano: anoN, mes: mesN, colaborador, registros: rows });
      filename  = `pernoites_${colaborador.replace(/\s+/g,'_')}_${anoN}_${mesN}.pdf`;
    } else if (tipo === 'vale-descarga') {
      const rows = db.prepare(`SELECT * FROM vw_holerite_vale_descarga WHERE _colaborador = @colaborador AND date(_data) BETWEEN @di AND @df ORDER BY _data ASC`).all({ colaborador, di, df });
      pdfBuffer = await gerarPdfValeDescarga({ ano: anoN, mes: mesN, colaborador, registros: rows });
      filename  = `vale_descarga_${colaborador.replace(/\s+/g,'_')}_${anoN}_${mesN}.pdf`;
    } else if (tipo === 'horas-extras') {
      const rows = db.prepare(`SELECT * FROM vw_holerite_horas_extras WHERE "Nome do Colaborador" = @colaborador AND date(_data) BETWEEN @di AND @df ORDER BY _data ASC`).all({ colaborador, di, df });
      const funcao = rows[0]?.['Função'] || '';
      pdfBuffer = await gerarPdfHorasExtras({ ano: anoN, mes: mesN, colaborador, funcao, registros: rows });
      filename  = `horas_extras_${colaborador.replace(/\s+/g,'_')}_${anoN}_${mesN}.pdf`;
    } else { return res.status(400).json({ error: 'Tipo inválido.' }); }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  } catch (err) { res.status(500).json({ error: 'Falha ao gerar PDF.' }); }
});

const { hashSenha, verificarSenha, gerarToken, verificarToken, authColaborador, authAdmin } = require('./auth');

app.post('/api/auth/login', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { username, senha } = req.body || {};
    if (!username || !senha) return res.status(400).json({ error: 'Informe usuário e senha.' });
    const colab = db.prepare(`SELECT * FROM colaboradores WHERE username = ? AND ativo = 1`).get(username);
    if (!colab) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    const ok = await verificarSenha(senha, colab.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    const token = gerarToken({ id: colab.id, username: colab.username, nome: colab.nome_completo, role: 'colaborador' });
    res.json({ ok: true, token, nome: colab.nome_completo, username: colab.username, funcao: colab.funcao, email: colab.email });
  } catch (err) { res.status(500).json({ error: 'Falha no login.' }); }
});

app.post('/api/auth/trocar-senha', authColaborador, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { senhaAtual, novaSenha } = req.body || {};
    if (!senhaAtual || !novaSenha) return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    if (novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    const colab = db.prepare(`SELECT * FROM colaboradores WHERE id = ?`).get(req.colaborador.id);
    const ok = await verificarSenha(senhaAtual, colab.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta.' });
    const novoHash = await hashSenha(novaSenha);
    db.prepare(`UPDATE colaboradores SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?`).run(novoHash, colab.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Falha ao trocar senha.' }); }
});

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'mercam2024';

app.post('/api/admin/login', async (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    res.json({ ok: true, token: gerarToken({ role: 'admin', user }) });
  } else { res.status(401).json({ error: 'Credenciais inválidas.' }); }
});

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const payload = verificarToken(token);
  if (!payload || payload.role !== 'admin') return res.status(401).json({ error: 'Token inválido.' });
  next();
}

app.get('/api/admin/colaboradores', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try { res.json(db.prepare(`SELECT id, username, nome_completo, funcao, email, ativo, criado_em FROM colaboradores ORDER BY nome_completo ASC`).all()); }
  catch (err) { res.status(500).json({ error: 'Falha ao listar colaboradores.' }); }
});

app.post('/api/admin/colaboradores', adminAuth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { username, senha, nome_completo, funcao, email } = req.body || {};
    if (!username || !senha || !nome_completo) return res.status(400).json({ error: 'Informe username, senha e nome completo.' });
    const funcaoValida = ['motorista', 'ajudante'].includes(funcao) ? funcao : 'motorista';
    const existe = db.prepare(`SELECT id FROM colaboradores WHERE username = ?`).get(username);
    if (existe) return res.status(400).json({ error: 'Username já cadastrado.' });
    const senha_hash = await hashSenha(senha);
    const result = db.prepare(`INSERT INTO colaboradores (username, senha_hash, nome_completo, funcao, email) VALUES (?, ?, ?, ?, ?)`).run(username, senha_hash, nome_completo, funcaoValida, email || '');
    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Falha ao cadastrar colaborador.' }); }
});

app.patch('/api/admin/colaboradores/:id/reset-senha', adminAuth, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { novaSenha } = req.body || {};
    if (!novaSenha) return res.status(400).json({ error: 'Informe a nova senha.' });
    const hash = await hashSenha(novaSenha);
    db.prepare(`UPDATE colaboradores SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?`).run(hash, req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Falha ao resetar senha.' }); }
});

app.patch('/api/admin/colaboradores/:id/email', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const { email } = req.body || {};
    db.prepare(`UPDATE colaboradores SET email = ?, atualizado_em = datetime('now') WHERE id = ?`).run(email || '', req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Falha ao atualizar email.' }); }
});

app.patch('/api/admin/colaboradores/:id/status', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const { ativo } = req.body || {};
    db.prepare(`UPDATE colaboradores SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?`).run(ativo ? 1 : 0, req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Falha ao atualizar status.' }); }
});

app.delete('/api/admin/colaboradores/:id', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    db.prepare('DELETE FROM colaboradores WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Falha ao deletar colaborador.' }); }
});

app.get('/api/admin/registros', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const { romaneio, colaborador, dataInicio, dataFim } = req.query;
    let where = 'WHERE 1=1'; const params = {};
    if (romaneio)    { where += ' AND romaneio = @rom';            params.rom = romaneio; }
    if (colaborador) { where += ' AND nome_colaborador LIKE @col'; params.col = `%${colaborador}%`; }
    if (dataInicio)  { where += ' AND data_registro >= @di';       params.di  = dataInicio; }
    if (dataFim)     { where += ' AND data_registro <= @df';       params.df  = dataFim; }
    const rows = db.prepare(`SELECT * FROM registro ${where} ORDER BY data_registro DESC, criado_em DESC LIMIT 200`).all(params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Falha ao buscar registros.' }); }
});

app.patch('/api/admin/registros/:id', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const { data_registro, hora_entrada, hora_saida, placa, romaneio, uf, cidade, pernoite, valor_pernoite, vale_descarga, valor_vale_descarga } = req.body || {};
    const minEntrada = hhmmToMin(hora_entrada); const minSaida = hhmmToMin(hora_saida);
    const horas_trabalhadas_min = Math.max(0, (minSaida - minEntrada) - ALMOCO_MIN);
    const horas_extras_min      = Math.max(0, horas_trabalhadas_min - JORNADA_EFETIVA_MIN);
    db.prepare(`
      UPDATE registro SET
        data_registro = @data_registro, hora_entrada = @hora_entrada, hora_saida = @hora_saida,
        horas_trabalhadas_min = @horas_trabalhadas_min, horas_extras_min = @horas_extras_min,
        placa = @placa, romaneio = @romaneio, uf = @uf, cidade = @cidade,
        pernoite = @pernoite, valor_pernoite = @valor_pernoite,
        vale_descarga = @vale_descarga, valor_vale_descarga = @valor_vale_descarga
      WHERE id = @id
    `).run({
      id: req.params.id, data_registro, hora_entrada, hora_saida,
      horas_trabalhadas_min, horas_extras_min, placa, romaneio, uf, cidade,
      pernoite: pernoite ? 1 : 0,
      valor_pernoite: pernoite ? Number(valor_pernoite) : null,
      vale_descarga: vale_descarga ? 1 : 0,
      valor_vale_descarga: vale_descarga ? Number(valor_vale_descarga) : null,
    });
    res.json({ ok: true, horas_trabalhadas_min, horas_extras_min });
  } catch (err) { res.status(500).json({ error: 'Falha ao atualizar registro.' }); }
});

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const total       = db.prepare(`SELECT COUNT(*) as n FROM registro`).get().n;
    const pernoites   = db.prepare(`SELECT COUNT(*) as n FROM registro WHERE pernoite = 1`).get().n;
    const vales       = db.prepare(`SELECT COUNT(*) as n FROM registro WHERE vale_descarga = 1`).get().n;
    const horasExtras = db.prepare(`SELECT COUNT(*) as n FROM registro WHERE horas_extras_min > 0`).get().n;
    res.json({ total, pernoites, vales, horasExtras });
  } catch (e) { res.status(500).json({ error: 'Falha ao buscar stats.' }); }
});

app.get('/api/admin/relatorio', adminAuth, (req, res) => {
  const db = req.app.locals.db;
  try {
    const { tipo, dataInicio, dataFim } = req.query;
    const cfg = VIEW_BY_TIPO[tipo];
    if (!cfg) return res.status(400).json({ error: 'Tipo inválido.' });
    let where = ''; const params = {};
    if (dataInicio && dataFim) { where = 'WHERE date(_data) BETWEEN @di AND @df'; params.di = dataInicio; params.df = dataFim; }
    else if (dataInicio)       { where = 'WHERE date(_data) >= @di';               params.di = dataInicio; }
    else if (dataFim)          { where = 'WHERE date(_data) <= @df';               params.df = dataFim; }
    res.json(db.prepare(`SELECT * FROM ${cfg.view} ${where} ORDER BY _data ASC`).all(params));
  } catch (e) { res.status(500).json({ error: 'Falha ao buscar relatório.' }); }
});

const cron = require('node-cron');

async function enviarHoleritesPorTipo(tipo) {
  const db = app.locals.db;
  const agora = new Date();
  let anoRef, mesRef;
  if (tipo === 'horas-extras') { anoRef = agora.getFullYear(); mesRef = agora.getMonth() + 1; }
  else { const d = new Date(agora.getFullYear(), agora.getMonth(), 0); anoRef = d.getFullYear(); mesRef = d.getMonth() + 1; }
  const di = `${anoRef}-${String(mesRef).padStart(2,'0')}-01`;
  const df = `${anoRef}-${String(mesRef).padStart(2,'0')}-31`;
  let view, colNome, colEmail;
  if (tipo === 'pernoites')          { view = 'vw_holerite_pernoites';     colNome = '_colaborador';          colEmail = '_email'; }
  else if (tipo === 'vale-descarga') { view = 'vw_holerite_vale_descarga'; colNome = '_colaborador';          colEmail = '_email'; }
  else                               { view = 'vw_holerite_horas_extras';  colNome = '"Nome do Colaborador"'; colEmail = '_email'; }
  const colaboradores = db.prepare(`SELECT DISTINCT ${colNome} AS nome, ${colEmail} AS email FROM ${view} WHERE date(_data) BETWEEN @di AND @df`).all({ di, df });
  if (!colaboradores.length) return;
  const victorEmail = process.env.MAIL_TO_VICTOR;
  const tipoLabel = tipo === 'pernoites' ? 'Pernoites' : tipo === 'vale-descarga' ? 'Vale de Descarga' : 'Horas Extras';
  const mesLabel  = `${String(mesRef).padStart(2,'0')}/${anoRef}`;
  for (const colab of colaboradores) {
    try {
      const rows = db.prepare(`SELECT * FROM ${view} WHERE ${colNome} = @colaborador AND date(_data) BETWEEN @di AND @df ORDER BY _data ASC`).all({ colaborador: colab.nome, di, df });
      let pdfBuffer;
      if (tipo === 'pernoites')          pdfBuffer = await gerarPdfPernoites({ ano: anoRef, mes: mesRef, colaborador: colab.nome, registros: rows });
      else if (tipo === 'vale-descarga') pdfBuffer = await gerarPdfValeDescarga({ ano: anoRef, mes: mesRef, colaborador: colab.nome, registros: rows });
      else { const funcao = rows[0]?.['Função'] || ''; pdfBuffer = await gerarPdfHorasExtras({ ano: anoRef, mes: mesRef, colaborador: colab.nome, funcao, registros: rows }); }
      enqueueEmail(db, {
        tipo: 'holerite',
        para: [victorEmail, colab.email].filter(Boolean).join(','),
        assunto: `Holerite ${tipoLabel} - ${colab.nome} - ${mesLabel}`,
        pdfBuffer,
        pdfFilename: `${tipo}_${colab.nome.replace(/\s+/g,'_')}_${anoRef}_${mesRef}.pdf`
      });
    } catch (err) { console.error(`[CRON][${tipo}] Erro:`, err.message); }
  }
  await processQueue(db);
}

function fazerBackup() {
  try {
    const backupDir = path.join(__dirname, 'db', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp   = new Date().toISOString().slice(0, 10);
    const origem  = path.join(__dirname, 'db', 'registros.db');
    const destino = path.join(backupDir, `registros_${stamp}.db`);
    fs.copyFileSync(origem, destino);
    const arquivos = fs.readdirSync(backupDir).filter(f => f.startsWith('registros_') && f.endsWith('.db')).sort();
    if (arquivos.length > 30) arquivos.slice(0, arquivos.length - 30).forEach(f => fs.unlinkSync(path.join(backupDir, f)));
  } catch (err) { console.error('[BACKUP] Erro:', err.message); }
}

cron.schedule('0 0 * * *', fazerBackup, { timezone: 'America/Sao_Paulo' });
cron.schedule('0 * * * *', () => processQueue(app.locals.db).catch(console.error), { timezone: 'America/Sao_Paulo' });
fazerBackup();

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.listen(PORT, () => console.log(`Servidor ON: http://localhost:${PORT}`));