require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

app.post('/enviar', async (req, res) => {
  const dados = req.body;
  
  // Cria o corpo do email dinamicamente
  let templateEmail = "<h2>Novo Registro de Horário</h2>";
  for (const [campo, valor] of Object.entries(dados)) {
    if(valor) templateEmail += `<p><strong>${campo.toUpperCase()}:</strong> ${valor}</p>`;
  }

  try {
    await transporter.sendMail({
      from: `"Sistema Pernoite" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: `Registro: ${dados.nome_motorista || dados.nome_ajudante}`,
      html: templateEmail
    });
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro");
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Servidor ON"));