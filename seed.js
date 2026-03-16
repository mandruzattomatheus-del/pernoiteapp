require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'db', 'registros.db');
const db = new Database(dbPath);

const SENHA_PADRAO = 'Mudar@26';

const colaboradores = [
  // Motoristas
  { nome: 'Alexandro Aymore de Oliveira Santos', username: 'alexandro.santos',  funcao: 'motorista' },
  { nome: 'Alvaro Aparecido de Oliveira Benedito', username: 'alvaro.benedito', funcao: 'motorista' },
  { nome: 'Bruno da Silva Meira',                  username: 'bruno.meira',     funcao: 'motorista' },
  { nome: 'Cleiton Gonzaga de Queiroga',           username: 'cleiton.queiroga',funcao: 'motorista' },
  { nome: 'Eder Antonio Henrique',                 username: 'eder.henrique',   funcao: 'motorista' },
  { nome: 'Jean Carlos Rodrigues do Nascimento',   username: 'jean.nascimento', funcao: 'motorista' },
  { nome: 'Jonas Santana dos Santos',              username: 'jonas.santos',    funcao: 'motorista' },
  { nome: 'Jose Clayton da Silva Rodrigues',       username: 'jose.rodrigues',  funcao: 'motorista' },
  { nome: 'Jose Crispin Vieira de Araujo',         username: 'jose.araujo',     funcao: 'motorista' },
  { nome: 'Leandro Caraciolo dos Santos',          username: 'leandro.santos',  funcao: 'motorista' },
  { nome: 'Lucas Guedes da Silva',                 username: 'lucas.silva',     funcao: 'motorista' },
  { nome: 'Nelson José Teixeira Miranda',          username: 'nelson.miranda',  funcao: 'motorista' },
  { nome: 'Wagner da Silva Peres Amaral',          username: 'wagner.amaral',   funcao: 'motorista' },
  { nome: 'Wilson de Souza',                       username: 'wilson.souza',    funcao: 'motorista' },
  // Ajudantes
  { nome: 'Airton Linhares',                          username: 'airton.linhares',   funcao: 'ajudante' },
  { nome: 'Cosme Jose de Oliveira',                   username: 'cosme.oliveira',    funcao: 'ajudante' },
  { nome: 'Damião Francisco Pereira',                 username: 'damiao.pereira',    funcao: 'ajudante' },
  { nome: 'Francisco das Chagas Pimentel Junior',     username: 'francisco.pimentel',funcao: 'ajudante' },
  { nome: 'Francisco Rodrigues do Nascimento',        username: 'francisco.nascimento', funcao: 'ajudante' },
  { nome: 'Leonardo Andrade da Silva',                username: 'leonardo.silva',    funcao: 'ajudante' },
  { nome: 'Marcos Baracho do Nascimento',             username: 'marcos.nascimento', funcao: 'ajudante' },
  { nome: 'Nivaldo de Barros',                        username: 'nivaldo.barros',    funcao: 'ajudante' },
  { nome: 'Elias Borges de Macedo',                   username: 'elias.macedo',      funcao: 'ajudante' },
];

async function seed() {
  const hash = await bcrypt.hash(SENHA_PADRAO, 10);
  let criados = 0;
  let pulados = 0;

  for (const c of colaboradores) {
    const existe = db.prepare('SELECT id FROM colaboradores WHERE username = ?').get(c.username);
    if (existe) {
      console.log(`[PULADO] ${c.username} já existe.`);
      pulados++;
      continue;
    }
    db.prepare('INSERT INTO colaboradores (username, senha_hash, nome_completo, funcao) VALUES (?, ?, ?, ?)')
      .run(c.username, hash, c.nome, c.funcao);
    console.log(`[OK] ${c.username} (${c.funcao})`);
    criados++;
  }

  console.log(`\nFinalizado! ${criados} criados, ${pulados} pulados.`);
  db.close();
}

seed().catch(console.error);
