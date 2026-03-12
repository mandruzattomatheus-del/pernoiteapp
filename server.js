require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

// Aceita JSON e também application/x-www-form-urlencoded (se enviar via form)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Helpers de normalização
function isYes(v) {
  if (typeof v === 'boolean') return v === true;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['1','true','on','yes','y','sim','s'].includes(s);
}
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['1','true','on','yes','y','sim','s'].includes(s);
}

app.post('/enviar', async (req, res) => {
  const dados = req.body || {};

  // Normalizações
  const funcao = String(dados.funcao_usuario || '').trim().toLowerCase();
  const temAjudante = isYes(dados.tem_ajudante);
  const valeDescarga = toBool(dados.vale_descarga);

  // ⚠️ Regra de negócio: motorista + ajudante = sim  => vale descarga proibido
  if (funcao === 'motorista' && temAjudante && valeDescarga) {
    return res.status(400).json({
      erro: 'Vale descarga não é permitido quando colaborador é motorista e teve ajudante.'
    });
  }

  // (Opcional/Coerência com a UI) Ajudante nunca deve enviar vale descarga
  if (funcao === 'ajudante' && valeDescarga) {
    return res.status(400).json({
      erro: 'Vale descarga não é aplicável para ajudante.'
    });
  }

  // Monta o corpo do e-mail dinamicamente (só inclui campos com valor)
  let templateEmail = "<h2>Novo Registro de Horário</h2>";
  for (const [campo, valor] of Object.entries(dados)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      templateEmail += `<p><strong>${String(campo).toUpperCase()}:</strong> ${String(valor)}</p>`;
    }
  }

  try {
    await transporter.sendMail({
      from: `"Sistema Pernoite" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: `Registro: ${dados.nome_motorista || dados.nome_ajudante || 'Colaborador'}`,
      html: templateEmail
    });
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro");
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Servidor ON"));
