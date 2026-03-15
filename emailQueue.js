// ===== Fila de E-mails com Retry =====

function buildTransport(process) {
  const nodemailer = require('nodemailer');
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

/**
 * Adiciona um e-mail à fila
 */
function enqueueEmail(db, { tipo, para, assunto, html, pdfBuffer, pdfFilename }) {
  db.prepare(`
    INSERT INTO email_queue (tipo, para, assunto, html, pdf_buffer, pdf_filename)
    VALUES (@tipo, @para, @assunto, @html, @pdf_buffer, @pdf_filename)
  `).run({
    tipo,
    para,
    assunto,
    html: html || null,
    pdf_buffer: pdfBuffer || null,
    pdf_filename: pdfFilename || null
  });
  console.log(`[QUEUE] E-mail enfileirado: ${assunto} → ${para}`);
}

/**
 * Processa a fila — tenta enviar todos os pendentes
 */
async function processQueue(db) {
  const pendentes = db.prepare(`
    SELECT * FROM email_queue
    WHERE status = 'pendente'
      AND tentativas < max_tentativas
    ORDER BY criado_em ASC
  `).all();

  if (!pendentes.length) {
    console.log('[QUEUE] Nenhum e-mail pendente.');
    return;
  }

  console.log(`[QUEUE] Processando ${pendentes.length} e-mail(s) pendente(s)...`);
  const transporter = buildTransport(process);

  for (const item of pendentes) {
    try {
      const mailOptions = {
        from: process.env.MAIL_FROM || `Mercam <${process.env.SMTP_USER}>`,
        to: item.para,
        subject: item.assunto,
      };

      if (item.html) mailOptions.html = item.html;

      if (item.pdf_buffer && item.pdf_filename) {
        mailOptions.attachments = [{
          filename: item.pdf_filename,
          content: Buffer.from(item.pdf_buffer)
        }];
      }

      await transporter.sendMail(mailOptions);

      // Marca como enviado
      db.prepare(`
        UPDATE email_queue
        SET status = 'enviado', enviado_em = datetime('now'), tentativas = tentativas + 1, erro = null
        WHERE id = ?
      `).run(item.id);

      console.log(`[QUEUE] ✅ Enviado: ${item.assunto} → ${item.para}`);

    } catch (err) {
      const novasTentativas = item.tentativas + 1;
      const novoStatus = novasTentativas >= item.max_tentativas ? 'falhou' : 'pendente';

      db.prepare(`
        UPDATE email_queue
        SET tentativas = ?, status = ?, erro = ?
        WHERE id = ?
      `).run(novasTentativas, novoStatus, err.message, item.id);

      console.error(`[QUEUE] ❌ Falha (tentativa ${novasTentativas}/${item.max_tentativas}): ${item.assunto} → ${item.para} — ${err.message}`);
    }
  }
}

module.exports = { enqueueEmail, processQueue };
