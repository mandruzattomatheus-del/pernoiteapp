const puppeteer = require('puppeteer');

// ─── Helpers ────────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

function nomeMes(n) { return MESES[n - 1] || ''; }

function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

function todosDiasDoMes(ano, mes) {
  const total = diasNoMes(ano, mes);
  const dias = [];
  for (let d = 1; d <= total; d++) {
    const dd = String(d).padStart(2, '0');
    const mm = String(mes).padStart(2, '0');
    dias.push(`${ano}-${mm}-${dd}`);
  }
  return dias;
}

function formatDia(dateStr) {
  return dateStr ? dateStr.slice(8, 10) : '';
}

function minToHHMM(min) {
  if (!min && min !== 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10px;
    color: #000;
    padding: 20px 24px;
  }
  .cabecalho { margin-bottom: 10px; }
  .cabecalho p { font-size: 9.5px; line-height: 1.5; }
  .titulo {
    text-align: center;
    font-weight: bold;
    font-size: 11px;
    margin: 10px 0 4px;
    text-transform: uppercase;
  }
  .mes-linha {
    text-align: right;
    font-size: 9.5px;
    margin-bottom: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
  }
  th, td {
    border: 1px solid #000;
    padding: 2px 4px;
    font-size: 9px;
  }
  th { font-weight: bold; background: #fff; text-align: center; }
  td { text-align: center; }
  td.left { text-align: left; }
  .totais { margin: 6px 0; font-size: 10px; }
  .totais span { font-weight: bold; }
  .recibo { margin-top: 10px; font-size: 9.5px; line-height: 1.7; }
  .assinatura { margin-top: 24px; text-align: center; }
  .assinatura .linha { border-top: 1px solid #000; width: 60%; margin: 0 auto 2px; }
  .assinatura p { font-weight: bold; font-size: 10px; }
  .banco { margin-top: 10px; font-size: 9.5px; }
  .borda-geral { border: 1px solid #000; padding: 12px; }
`;

function htmlPernoites({ ano, mes, colaborador, registros }) {
  const dias = todosDiasDoMes(ano, mes);
  const regMap = {};
  registros.forEach(r => { regMap[r._data] = r; });

  let totalQtd = 0;
  let totalValor = 0;

  const linhas = dias.map(data => {
    const reg = regMap[data];
    const dia = formatDia(data);
    const dNum = parseInt(dia, 10);
    const dProx = String(dNum + 1).padStart(2, '0');
    const diaLabel = `${dia} P / ${dProx}`;

    if (reg) {
      totalQtd++;
      const valor = reg.SERVIÇO
        ? parseFloat(String(reg.SERVIÇO).replace('R$','').replace(',','.').trim()) || 0
        : 0;
      totalValor += valor;
      return `
        <tr>
          <td>${diaLabel}</td>
          <td>${reg.PLACA || ''}</td>
          <td class="left">${reg.CIDADE || ''}</td>
          <td>${reg.UF || ''}</td>
          <td>${reg.DOCUMENTO || ''}</td>
          <td>${reg.SERVIÇO || ''}</td>
          <td></td>
        </tr>`;
    }
    return `
      <tr>
        <td>${diaLabel}</td>
        <td></td><td></td><td></td><td></td><td></td><td></td>
      </tr>`;
  }).join('');

  const totalBRL = 'R$ ' + totalValor.toFixed(2).replace('.', ',');

  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8">
<style>${BASE_CSS}</style>
</head>
<body>
<div class="borda-geral">
  <div class="cabecalho">
    <p><strong>MERCAM</strong></p>
    <p>Transportes Ltda</p>
    <p>R: Dr. Luiz Carlos, 1212 - Vila Aricanduva - Cep. 03505-000</p>
    <p>São Paulo - Sp - Fone : (11)2091-2700 - Fax : 2091-1164</p>
    <p>E-Mail : valeria@mercam.com.br</p>
  </div>
  <div class="titulo">Relatório de Pernoites</div>
  <div class="mes-linha">MÊS: <strong>${nomeMes(mes)}</strong></div>
  <table>
    <thead>
      <tr>
        <th>DIA</th><th>PLACA</th><th>CIDADE</th><th>UF</th>
        <th>DOCUMENTO</th><th>SERVIÇO</th><th>VISTO</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="totais">
    TOTAL DE PERNOITES &nbsp;&nbsp;&nbsp; <span>${totalQtd}</span>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; TOTAL &nbsp;&nbsp; <span>${totalBRL}</span>
  </div>
  <div class="recibo">
    <p>RECEBI DA MERCAM TRANSPORTES LTDA A IMPORTANCIA DE REFERENTE</p>
    <p>RELATORIO ACIMA, POR SER VERDADE FIRMO O PRESENTE .</p>
    <p style="margin-top:6px">SÃO PAULO ,........DE.........................DE............</p>
  </div>
  <div class="assinatura">
    <div class="linha"></div>
    <p>${colaborador.toUpperCase()}</p>
  </div>
  <div class="banco">
    BANCO : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    AG. : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    C/C :
  </div>
</div>
</body></html>`;
}

function htmlValeDescarga({ ano, mes, colaborador, registros }) {
  const dias = todosDiasDoMes(ano, mes);
  const regMap = {};
  registros.forEach(r => { regMap[r._data] = r; });

  let totalQtd = 0;
  let totalValor = 0;

  const linhas = dias.map(data => {
    const reg = regMap[data];
    const dia = formatDia(data);

    if (reg) {
      totalQtd++;
      const valor = reg.SERVIÇO
        ? parseFloat(String(reg.SERVIÇO).replace('R$','').replace(',','.').trim()) || 0
        : 0;
      totalValor += valor;
      return `
        <tr>
          <td>${dia}</td>
          <td>${reg.PLACA || ''}</td>
          <td class="left">${reg.CIDADE || ''}</td>
          <td>${reg.UF || ''}</td>
          <td>${reg.DOCUMENTO || ''}</td>
          <td>${reg.SERVIÇO || ''}</td>
          <td></td>
        </tr>`;
    }
    return `
      <tr>
        <td>${dia}</td>
        <td></td><td></td><td></td><td></td><td></td><td></td>
      </tr>`;
  }).join('');

  const totalBRL = 'R$ ' + totalValor.toFixed(2).replace('.', ',');

  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8">
<style>${BASE_CSS}</style>
</head>
<body>
<div class="borda-geral">
  <div class="cabecalho">
    <p><strong>MERCAM</strong></p>
    <p>Transportes Ltda</p>
    <p>R: Dr. Luiz Carlos, 1212 - Vila Aricanduva - Cep. 03505-000</p>
    <p>São Paulo - Sp - Fone : (11)2091-2700 - Fax : 2091-1164</p>
    <p>E-Mail : valeria@mercam.com.br</p>
  </div>
  <div class="titulo">Vale de Descarga</div>
  <div class="mes-linha">MÊS: <strong>${nomeMes(mes)}</strong></div>
  <table>
    <thead>
      <tr>
        <th>DIA</th><th>PLACA</th><th>CIDADE</th><th>UF</th>
        <th>DOCUMENTO</th><th>SERVIÇO</th><th>VISTO</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="totais">
    TOTAL DE VALE DE DESCARGA &nbsp;&nbsp;&nbsp; <span>${totalQtd}</span>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; TOTAL &nbsp;&nbsp; <span>${totalBRL}</span>
  </div>
  <div class="recibo">
    <p>RECEBI DA MERCAM TRANSPORTES LTDA A IMPORTANCIA DE REFERENTE</p>
    <p>RELATORIO ACIMA, POR SER VERDADE FIRMO O PRESENTE .</p>
    <p style="margin-top:6px">SÃO PAULO ,........DE.........................DE............</p>
  </div>
  <div class="assinatura">
    <div class="linha"></div>
    <p>${colaborador.toUpperCase()}</p>
  </div>
  <div class="banco">
    BANCO : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    AG. : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    C/C :
  </div>
</div>
</body></html>`;
}

function htmlHorasExtras({ ano, mes, colaborador, funcao, registros }) {
  const dias = todosDiasDoMes(ano, mes);
  const regMap = {};
  registros.forEach(r => { regMap[r._data] = r; });

  let totalExtrasMin = 0;

  const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const mesAbrev = MESES_ABREV[mes - 1];

  const linhas = dias.map(data => {
    const reg = regMap[data];
    const dNum = parseInt(formatDia(data), 10);
    const diaLabel = `${String(dNum).padStart(2,'0')}/${mesAbrev}.`;

    if (reg) {
      const extrasMin = reg['Hora Extra']
        ? (() => {
            const parts = String(reg['Hora Extra']).split(':');
            return parseInt(parts[0],10)*60 + parseInt(parts[1],10);
          })()
        : 0;
      totalExtrasMin += extrasMin;
      return `
        <tr>
          <td class="left">${diaLabel}</td>
          <td>${reg['Entrada'] || ''}</td>
          <td>${reg['Saída'] || ''}</td>
          <td>${reg['Hora Extra'] || ''}</td>
          <td>${reg['Romaneio / OC'] || ''}</td>
          <td></td>
        </tr>`;
    }
    return `
      <tr>
        <td class="left">${diaLabel}</td>
        <td></td><td></td><td></td><td></td><td></td>
      </tr>`;
  }).join('');

  const totalExtrasHHMM = minToHHMM(totalExtrasMin);

  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8">
<style>
${BASE_CSS}
.info-colab {
  border: 1px solid #000;
  padding: 4px 6px;
  margin-bottom: 6px;
  display: flex;
  gap: 16px;
  font-size: 9.5px;
}
.info-colab .bloco { flex: 1; }
.info-colab .label { font-size: 8.5px; }
.info-colab .valor { font-weight: bold; }
.jornada-padrao {
  display: flex;
  border: 1px solid #000;
  margin-bottom: 6px;
  font-size: 9px;
}
.jornada-padrao div {
  flex: 1;
  border-right: 1px solid #000;
  padding: 2px 6px;
}
.jornada-padrao div:last-child { border-right: none; }
.jornada-padrao .label { font-size: 8.5px; }
.jornada-padrao .valor { font-weight: bold; }
</style>
</head>
<body>
<div class="borda-geral">
  <div class="cabecalho">
    <p><strong>MERCAM</strong></p>
    <p>Transportes Ltda</p>
    <p>R: Santana de Ipanema, 1213 – Cumbica CEP 07220-010</p>
    <p>São Paulo - Sp - Fone : (11)2091-2700 - Fax : 2091-1164</p>
    <p>E-Mail : transportes@mercam.com.br</p>
  </div>
  <div class="titulo" style="margin-bottom:8px">Controle de Jornada de Trabalho</div>
  <div class="info-colab">
    <div class="bloco">
      <div class="label">Nome do Colaborador</div>
      <div class="valor">${colaborador.toUpperCase()}</div>
    </div>
    <div class="bloco">
      <div class="label">Função</div>
      <div class="valor">${(funcao || '').toUpperCase()}</div>
    </div>
    <div class="bloco">
      <div class="label">Total de Horas</div>
      <div class="valor">${totalExtrasHHMM}</div>
    </div>
    <div class="bloco">
      <div class="label">Hora Extra</div>
      <div class="valor">R$ -</div>
    </div>
  </div>
  <div class="jornada-padrao">
    <div>
      <div class="label">Jornada de Trabalho</div>
    </div>
    <div>
      <div class="label">Entrada</div>
      <div class="valor">08:00</div>
    </div>
    <div>
      <div class="label">Intervalo</div>
      <div class="valor">12h às 13h</div>
    </div>
    <div>
      <div class="label">Saída</div>
      <div class="valor">17:45</div>
    </div>
    <div>
      <div class="label">Mês/Ano</div>
      <div class="valor">${nomeMes(mes).toUpperCase()} / ${ano}</div>
    </div>
    <div>
      <div class="label">Observação</div>
      <div class="valor"></div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Dia</th>
        <th>Entrada</th>
        <th>Saída</th>
        <th>Hora Extra</th>
        <th>Romaneio / OC</th>
        <th>Visto fiscal</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
</div>
</body></html>`;
}

async function gerarPdf(htmlContent) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = {
  gerarPdfPernoites: async ({ ano, mes, colaborador, registros }) => {
    return gerarPdf(htmlPernoites({ ano, mes, colaborador, registros }));
  },
  gerarPdfValeDescarga: async ({ ano, mes, colaborador, registros }) => {
    return gerarPdf(htmlValeDescarga({ ano, mes, colaborador, registros }));
  },
  gerarPdfHorasExtras: async ({ ano, mes, colaborador, funcao, registros }) => {
    return gerarPdf(htmlHorasExtras({ ano, mes, colaborador, funcao, registros }));
  },
};
