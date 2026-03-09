require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/enviar', async (req, res) => {
  const { nome, email, mensagem } = req.body;

  try {
    await transporter.sendMail({
      from: `"Site Pernoite" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      replyTo: email,
      subject: `Nova mensagem de ${nome}`,
      text: `
Nome: ${nome}
Email: ${email}

Mensagem:
${mensagem}
      `,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Nova mensagem recebida</h2>
          <p><strong>Nome:</strong> ${nome}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Mensagem:</strong></p>
          <p>${mensagem}</p>
        </div>
      `
    });

    await transporter.sendMail({
      from: `"Empresa Pernoite" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Recebemos sua mensagem!",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Olá ${nome} 👋</h2>
          <p>Recebemos sua mensagem com sucesso!</p>
          <p>Em breve entraremos em contato.</p>
          <hr>
          <p><strong>Sua mensagem:</strong></p>
          <p>${mensagem}</p>
        </div>
      `
    });

    res.send("Mensagem enviada com sucesso!");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao enviar mensagem.");
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${process.env.PORT}`);
});