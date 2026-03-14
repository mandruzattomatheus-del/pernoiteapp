PRAGMA foreign_keys = ON;

-- =========================================
-- TABELA PRINCIPAL: um registro por envio
-- =========================================
CREATE TABLE IF NOT EXISTS registro (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identificação
  nome_colaborador        TEXT    NOT NULL,                 -- vindo do select (motorista ou ajudante)
  funcao                  TEXT    NOT NULL CHECK(funcao IN ('motorista','ajudante')),

  -- Data / horários (strings do formulário) + métricas calculadas no backend
  data_registro           TEXT    NOT NULL,                 -- 'YYYY-MM-DD'
  hora_entrada            TEXT    NOT NULL,                 -- 'HH:MM'
  hora_saida              TEXT    NOT NULL,                 -- 'HH:MM'
  horas_trabalhadas_min   INTEGER,                          -- calculada no backend (já descontando 60 min de almoço fixo)
  horas_extras_min        INTEGER,                          -- calculada no backend: max(0, horas_trabalhadas_min - 525)  (8h45 = 525 min)

  -- Local / documento
  romaneio                TEXT    NOT NULL,                 -- "Romaneio / Ordem de Coleta" (Documento nos holerites)
  uf                      TEXT    NOT NULL,                 -- ex.: 'SP'
  cidade                  TEXT    NOT NULL,

  -- Veículo
  placa                   TEXT    NOT NULL,                 -- ex.: 'EOU-0G85' (apenas a placa, sem a descrição)

  -- Flags e valores por tipo
  pernoite                INTEGER NOT NULL DEFAULT 0,       -- 0/1
  valor_pernoite          REAL,                             -- ex.: 50.00 (setado pelo backend quando pernoite=1)
  vale_descarga           INTEGER NOT NULL DEFAULT 0,       -- 0/1
  valor_vale_descarga     REAL,                             -- ex.: 100.00 (setado pelo backend quando vale_descarga=1)

  -- Apenas para impressão; manter vazio
  visto_fiscal            TEXT,                             -- sempre em branco ("") para assinatura manual

  criado_em               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_registro_data  ON registro (data_registro);
CREATE INDEX IF NOT EXISTS idx_registro_flags ON registro (pernoite, vale_descarga);
CREATE INDEX IF NOT EXISTS idx_registro_nome  ON registro (nome_colaborador);

-- =========================================
-- VIEWS para gerar os três holerites
-- (ajustadas para que "Visto" seja a ÚLTIMA coluna)
-- =========================================

-- 1) HORAS EXTRAS / CONTROLE DE JORNADA
-- Colunas: Dia | Entrada | Saída | Hora Extra | Romaneio / OC | Nome do Colaborador | Função | (auxiliares) | Visto fiscal (POR ÚLTIMO)
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
  data_registro                 AS _data,                     -- auxiliares p/ filtro/ordenação
  criado_em                     AS _criado_em,
  ''                            AS "Visto fiscal"             -- última coluna, sempre em branco
FROM registro
WHERE COALESCE(horas_extras_min,0) > 0;

-- 2) RELATÓRIO DE PERNOITES
-- Colunas: DIA | PLACA | CIDADE | UF | DOCUMENTO | SERVIÇO | (auxiliares) | VISTO (POR ÚLTIMO)
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
  data_registro                 AS _data,
  ''                            AS "VISTO"                    -- última coluna, sempre em branco
FROM registro
WHERE pernoite = 1;

-- 3) VALE DE DESCARGA
-- Colunas: DIA | PLACA | CIDADE | UF | DOCUMENTO | SERVIÇO | (auxiliares) | VISTO (POR ÚLTIMO)
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
  data_registro                 AS _data,
  ''                            AS "VISTO"                    -- última coluna, sempre em branco
FROM registro
WHERE vale_descarga = 1;