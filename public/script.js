// ===== Interface e regras de visibilidade =====
document.addEventListener("DOMContentLoaded", () => {
  const funcao = document.getElementById("funcao");
  const resto = document.getElementById("resto");
  const submitBtn = resto?.querySelector('button[type="submit"]');

  // Seções por papel
  const areaMotorista = document.getElementById("areaMotorista");
  const areaAjudante = document.getElementById("areaAjudante");

  // Controles internos do motorista
  const temAjudante = document.getElementById("temAjudante");
  const blocoAjudanteDoMotorista = document.getElementById("blocoAjudanteDoMotorista");

  // Vale Descarga
  const blocoValeDescarga = document.getElementById("blocoValeDescarga");
  const inputValeDescarga = document.getElementById("valeDescarga");

  // Todos os campos que só devem ser obrigatórios quando o resto estiver visível
  const requiredLater = resto ? resto.querySelectorAll("[data-required]") : [];

  function setRequiredAndDisabled(enabled) {
    requiredLater.forEach((el) => {
      if (enabled) {
        el.setAttribute("required", "required");
        el.removeAttribute("disabled");
      } else {
        el.removeAttribute("required");
        el.setAttribute("disabled", "disabled");
      }
    });

    // Outros selects/botões que não são required mas fazem parte do fluxo
    resto.querySelectorAll("select:not([data-required]), input:not([data-required]), button[type='submit']")
      .forEach((el) => {
        if (enabled) el.removeAttribute("disabled");
        else el.setAttribute("disabled", "disabled");
      });
  }

  function toggleSection(sectionEl, show) {
    if (!sectionEl) return;

    sectionEl.setAttribute("aria-hidden", show ? "false" : "true");
    sectionEl.classList.toggle("hidden-section", !show);

    // Ao mostrar: não force "block"; remova o display inline para o CSS assumir (ex.: flex).
    // Ao ocultar: display none.
    if (show) {
      sectionEl.style.removeProperty('display');
    } else {
      sectionEl.style.display = 'none';
    }

    // Habilita/desabilita campos internos
    sectionEl.querySelectorAll("input, select, textarea").forEach((el) => {
      if (show) el.removeAttribute("disabled");
      else el.setAttribute("disabled", "disabled");
    });
  }

  function aplicarRegraValeDescarga(papelAtual) {
    // Ajuda de segurança: sempre limpar o check ao ocultar
    const ocultarEVetar = () => {
      if (inputValeDescarga) {
        inputValeDescarga.checked = false;
        inputValeDescarga.setAttribute("disabled", "disabled");
      }
      toggleSection(blocoValeDescarga, false);
    };

    const exibirELiberar = () => {
      toggleSection(blocoValeDescarga, true);
      if (inputValeDescarga) {
        inputValeDescarga.removeAttribute("disabled");
      }
    };

    // 1) Se for ajudante, oculta (mantém comportamento atual do seu código)
    if (papelAtual === "ajudante") {
      ocultarEVetar();
      return;
    }

    // 2) Se for motorista, depende de "tem ajudante"
    if (papelAtual === "motorista") {
      const v = temAjudante?.value ?? "";
      if (v === "sim") {
        ocultarEVetar(); // motorista + ajudante => não pode ver/usar vale descarga
      } else {
        // v === "" (ainda não escolheu) OU v === "nao" => pode ver/usar
        exibirELiberar();
      }
      return;
    }

    // 3) Sem função selecionada: deixar visível por padrão (não impacta pois 'resto' fica oculto)
    exibirELiberar();
  }

  function atualizarInterface() {
    const papel = funcao?.value;

    // Mostra/oculta o bloco geral
    const showResto = Boolean(papel);
    if (resto) resto.hidden = !showResto;
    setRequiredAndDisabled(showResto);

    // Regras específicas para o select "temAjudante"
    if (papel === "motorista") {
      // Torna obrigatório e força o placeholder para garantir escolha explícita
      temAjudante?.setAttribute("required", "required");
      if (temAjudante && (temAjudante.value !== "sim" && temAjudante.value !== "nao")) {
        temAjudante.value = ""; // garante que o usuário precise escolher
      }
    } else {
      // Se não for motorista, não é obrigatório
      temAjudante?.removeAttribute("required");
      // Opcional: resetar para placeholder quando sair de motorista
      if (temAjudante) temAjudante.value = "";
    }

    // Mostra apenas a seção do papel escolhido
    toggleSection(areaMotorista, papel === "motorista");
    toggleSection(areaAjudante, papel === "ajudante");

    // Ajuste do bloco "ajudante do motorista"
    if (papel === "motorista") {
      const v = temAjudante?.value ?? "";
      const tem = v === "sim";
      toggleSection(blocoAjudanteDoMotorista, tem);
    } else {
      toggleSection(blocoAjudanteDoMotorista, false);
    }

    // >>> Regra do Vale Descarga <<<
    aplicarRegraValeDescarga(papel);

    // Foco no primeiro campo disponível quando revelar
    if (showResto) {
      const firstFocusable = resto.querySelector("input:not([disabled]), select:not([disabled])");
      firstFocusable?.focus();
    }
  }

  // Eventos
  funcao?.addEventListener("change", atualizarInterface);
  temAjudante?.addEventListener("change", atualizarInterface);

  // Inicializa estado
  atualizarInterface();
});

// ===== Validação Amigável =====
(() => {
  const form = document.getElementById('formPernoite');
  if (!form) return;

  // Seletor de campos que queremos observar
  const FIELD_SELECTOR = 'input, select, textarea';

  // Regras de validação específicas por campo (id ou name)
  const validators = {
    // Email: obrigatório se marcado como data-required e formato válido
    email: (el) => {
      const value = String(el.value || '').trim();
      if (isDisabledOrHidden(el)) return null; // não validar campo oculto/disabled
      if (isRequired(el) && !value) return 'Informe o e-mail.';
      if (value && !isValidEmail(value)) return 'Informe um e-mail válido (ex.: nome@empresa.com).';
      return null;
    },

    // Exemplos de regras para outros campos obrigatórios:
    data_registro: (el) => {
      const value = el.value;
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Informe a data.';
      return null;
    },
    romaneio: (el) => {
      const value = String(el.value || '').trim();
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Informe o romaneio / ordem de coleta.';
      return null;
    },
    uf: (el) => {
      const value = el.value;
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Selecione a UF.';
      return null;
    },
    cidade: (el) => {
      const value = String(el.value || '').trim();
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Informe a cidade.';
      return null;
    },

    // Campos condicionais por função
    nome_motorista: (el) => {
      const value = el.value;
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Selecione o motorista.';
      return null;
    },
    nome_ajudante: (el) => {
      const value = el.value;
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Selecione o ajudante.';
      return null;
    },
    motorista_responsavel: (el) => {
      const value = el.value;
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Selecione o motorista responsável.';
      return null;
    },

    // >>> Regra específica para "tem_ajudante"
    tem_ajudante: (el) => {
      if (isDisabledOrHidden(el)) return null;
      // Se estiver "required" (caso do motorista), exigir escolha explícita
      if (isRequired(el) && !el.value) return 'Selecione se estava com ajudante.';
      return null;
    },
  };

  // Email regex simples e prática
  function isValidEmail(email) {
    // cobre formatos comuns e evita extremos
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function isRequired(el) {
    // usa atributo native required ou nosso data-required
    return el.hasAttribute('required') || el.hasAttribute('data-required');
  }

  function isDisabledOrHidden(el) {
    if (el.disabled) return true;
    // se algum ancestral estiver com [hidden] ou aria-hidden="true", considerar oculto
    let node = el;
    while (node && node !== document.body) {
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }

  function ensureHint(el) {
    // cria (ou obtém) a div de mensagem logo após o campo
    let hint = el.nextElementSibling;
    if (!hint || !hint.classList || !hint.classList.contains('hint')) {
      hint = document.createElement('div');
      hint.className = 'hint';
      el.insertAdjacentElement('afterend', hint);
    }
    return hint;
  }

  function showError(el, msg) {
    const hint = ensureHint(el);
    hint.textContent = msg || '';
    el.classList.remove('is-valid');
    el.classList.toggle('is-error', Boolean(msg));
    if (!msg) {
      // se não há erro, aplica um "ok" discreto (opcional)
      el.classList.add('is-valid');
    }
    // acessibilidade
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validateField(el) {
    const nameOrId = el.name || el.id;
    const rule = validators[nameOrId];
    let msg = null;

    // 1) use uma regra específica, se existir
    if (typeof rule === 'function') {
      msg = rule(el);
    } else {
      // 2) fallback: required genérico
      if (!isDisabledOrHidden(el) && isRequired(el)) {
        const value = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : String(el.value || '').trim();
        if (!value) msg = 'Preencha este campo.';
      }
    }

    showError(el, msg);
    return !msg; // true = válido
  }

  function validateForm() {
    const fields = Array.from(form.querySelectorAll(FIELD_SELECTOR));
    let firstInvalid = null;

    for (const el of fields) {
      // ignorar elementos sem name/id (não submetidos) e desabilitados/ocultos
      if ((!el.name && !el.id) || isDisabledOrHidden(el)) continue;

      const ok = validateField(el);
      if (!ok && !firstInvalid) firstInvalid = el;
    }

    if (firstInvalid) {
      // impede envio e foca no primeiro problema
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  // Validação ao digitar/alterar
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (!el.matches?.(FIELD_SELECTOR)) return;
    // valida só o campo alterado
    validateField(el);
  });

  // Validação ao trocar selects/datas/etc.
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (!el.matches?.(FIELD_SELECTOR)) return;
    validateField(el);
  });

  // Bloquear envio se houver erro
  form.addEventListener('submit', (e) => {
    if (!validateForm()) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
})();

// ===== Cidades por UF (via IBGE) =====
(() => {
  const UF_SELECT_ID = 'uf';
  const CITY_SELECT_ID = 'cidade';
  const API_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados';

  const ufEl = document.getElementById(UF_SELECT_ID);
  const cityEl = document.getElementById(CITY_SELECT_ID);

  // Cache em memória para evitar requisições repetidas
  const cityCache = new Map(); // chave: 'SP', valor: [{id, nome}, ...]

  if (!ufEl || !cityEl) return;

  // Função utilitária para limpar e preparar o select de cidade
  function resetCitySelect(placeholder = 'Selecione a UF primeiro') {
    cityEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    cityEl.appendChild(opt);
    cityEl.value = '';
    cityEl.setAttribute('disabled', 'disabled');
  }

  // Normalização/ordenação com acentos
  function sortByNameBR(list) {
    return list.slice().sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );
  }

  // Popula as opções de cidade
  function fillCities(cities) {
    cityEl.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Selecionar cidade';
    cityEl.appendChild(first);

    sortByNameBR(cities).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nome;           // se preferir ID, use c.id
      opt.textContent = c.nome;
      cityEl.appendChild(opt);
    });

    cityEl.removeAttribute('disabled');
  }

  async function fetchCitiesByUF(uf) {
    // Retorna do cache se houver
    if (cityCache.has(uf)) return cityCache.get(uf);

    const url = `${API_BASE}/${uf}/municipios`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);

    const data = await res.json(); // [{id, nome, microrregiao: {...}}]
    // Guarda apenas {id, nome} para simplificar
    const simple = data.map(({ id, nome }) => ({ id, nome }));
    cityCache.set(uf, simple);
    return simple;
  }

  async function onUFChange() {
    const uf = ufEl.value;
    if (!uf) {
      resetCitySelect('Selecione a UF primeiro');
      return;
    }

    // Estado de carregando
    resetCitySelect('Carregando cidades...');
    cityEl.removeAttribute('disabled');

    try {
      const cities = await fetchCitiesByUF(uf);
      if (!cities || !cities.length) {
        resetCitySelect('Nenhuma cidade encontrada');
        return;
      }
      fillCities(cities);
    } catch (err) {
      console.error('Erro ao buscar cidades do IBGE:', err);
      resetCitySelect('Falha ao carregar. Tente novamente.');
    }
  }

  // Eventos
  ufEl.addEventListener('change', onUFChange);

  // Se já houver uma UF preenchida (ex.: rascunho restaurado), carrega as cidades
  if (ufEl.value) {
    onUFChange().catch(() => {});
  } else {
    resetCitySelect(); // estado inicial
  }
})();