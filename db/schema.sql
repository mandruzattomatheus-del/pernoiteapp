PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registro (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_colaborador        TEXT    NOT NULL,
  funcao                  TEXT    NOT NULL CHECK(funcao IN ('motorista','ajudante')),
  email                   TEXT    NOT NULL DEFAULT '',
  data_registro           TEXT    NOT NULL,
  hora_entrada            TEXT    NOT NULL,
  hora_saida              TEXT    NOT NULL,
  horas_trabalhadas_min   INTEGER,
  horas_extras_min        INTEGER,
  romaneio                TEXT    NOT NULL,
  uf                      TEXT    NOT NULL,
  cidade                  TEXT    NOT NULL,
  placa                   TEXT    NOT NULL,
  pernoite                INTEGER NOT NULL DEFAULT 0,
  valor_pernoite          REAL,
  vale_descarga           INTEGER NOT NULL DEFAULT 0,
  valor_vale_descarga     REAL,
  visto_fiscal            TEXT,
  criado_em               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registro_data  ON registro (data_registro);
CREATE INDEX IF NOT EXISTS idx_registro_flags ON registro (pernoite, vale_descarga);
CREATE INDEX IF NOT EXISTS idx_registro_nome  ON registro (nome_colaborador);

DROP VIEW IF EXISTS vw_holerite_horas_extras;
CREATE VIEW vw_holerite_horas_extras AS
SELECT
  id,
  strftime('%d', data_registro) AS "Dia",
  hora_entrada                  AS "Entrada",
  hora_saida                    AS "Saída",
  printf('%02d:%02d', COALESCE(horas_extras_min,0)/60, COALESCE(horas_extras_min,0)%60) AS "Hora Extra",
  romaneio                      AS "Romaneio / OC",
  nome_colaborador              AS "Nome do Colaborador",
  funcao                        AS "Função",
  email                         AS _email,
  data_registro                 AS _data,
  criado_em                     AS _criado_em,
  ''                            AS "Visto fiscal"
FROM registro
WHERE COALESCE(horas_extras_min,0) > 0;

DROP VIEW IF EXISTS vw_holerite_pernoites;
CREATE VIEW vw_holerite_pernoites AS
SELECT
  id,
  strftime('%d', data_registro) AS "DIA",
  placa                         AS "PLACA",
  cidade                        AS "CIDADE",
  uf                            AS "UF",
  romaneio                      AS "DOCUMENTO",
  'R$' || replace(printf('%.2f', COALESCE(valor_pernoite, 0)), '.', ',') AS "SERVIÇO",
  nome_colaborador              AS _colaborador,
  email                         AS _email,
  data_registro                 AS _data,
  ''                            AS "VISTO"
FROM registro
WHERE pernoite = 1;

DROP VIEW IF EXISTS vw_holerite_vale_descarga;
CREATE VIEW vw_holerite_vale_descarga AS
SELECT
  id,
  strftime('%d', data_registro) AS "DIA",
  placa                         AS "PLACA",
  cidade                        AS "CIDADE",
  uf                            AS "UF",
  romaneio                      AS "DOCUMENTO",
  'R$' || replace(printf('%.2f', COALESCE(valor_vale_descarga, 0)), '.', ',') AS "SERVIÇO",
  nome_colaborador              AS _colaborador,
  email                         AS _email,
  data_registro                 AS _data,
  ''                            AS "VISTO"
FROM registro
WHERE vale_descarga = 1;


-- =========================================
-- FILA DE E-MAILS (retry automático)
-- =========================================
CREATE TABLE IF NOT EXISTS email_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo          TEXT NOT NULL,           -- 'confirmacao' | 'holerite'
  para          TEXT NOT NULL,           -- destinatário(s)
  assunto       TEXT NOT NULL,
  html          TEXT,                    -- corpo HTML (confirmação)
  pdf_buffer    BLOB,                    -- anexo PDF (holerite)
  pdf_filename  TEXT,                    -- nome do arquivo PDF
  tentativas    INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 3,
  status        TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'enviado' | 'falhou'
  erro          TEXT,                    -- último erro
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  enviado_em    TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON email_queue (status);

-- =========================================
-- TABELA DE COLABORADORES (login)
-- =========================================

CREATE TABLE IF NOT EXISTS colaboradores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,        -- ex: bruno.meira
  senha_hash    TEXT NOT NULL,               -- bcrypt
  nome_completo TEXT NOT NULL,               -- ex: Bruno da Silva Meira
  funcao        TEXT NOT NULL DEFAULT 'motorista' CHECK(funcao IN ('motorista','ajudante')),
  ativo         INTEGER NOT NULL DEFAULT 1,  -- 0 = desativado
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_username ON colaboradores (username);