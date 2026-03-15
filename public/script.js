// ===== Interface e regras de visibilidade =====
document.addEventListener("DOMContentLoaded", () => {
  const funcao = document.getElementById("funcao");
  const resto = document.getElementById("resto");

  const areaMotorista = document.getElementById("areaMotorista");
  const areaAjudante = document.getElementById("areaAjudante");
  const temAjudante = document.getElementById("temAjudante");
  const blocoAjudanteDoMotorista = document.getElementById("blocoAjudanteDoMotorista");
  const blocoValeDescarga = document.getElementById("blocoValeDescarga");
  const inputValeDescarga = document.getElementById("valeDescarga");
  const blocoPlaca = document.getElementById("blocoPlaca");
  const placaSelect = document.getElementById("placaSelect");
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
    sectionEl.hidden = !show;
    if (show) {
      sectionEl.style.removeProperty('display');
    } else {
      sectionEl.style.display = 'none';
    }
    sectionEl.querySelectorAll("input, select, textarea").forEach((el) => {
      if (show) el.removeAttribute("disabled");
      else el.setAttribute("disabled", "disabled");
    });
  }

  function aplicarRegraValeDescarga(papelAtual) {
    const ocultarEVetar = () => {
      if (inputValeDescarga) {
        inputValeDescarga.checked = false;
        inputValeDescarga.setAttribute("disabled", "disabled");
      }
      toggleSection(blocoValeDescarga, false);
    };
    const exibirELiberar = () => {
      toggleSection(blocoValeDescarga, true);
      if (inputValeDescarga) inputValeDescarga.removeAttribute("disabled");
    };
    if (papelAtual === "ajudante") { ocultarEVetar(); return; }
    if (papelAtual === "motorista") {
      const v = temAjudante?.value ?? "";
      if (v === "sim") ocultarEVetar();
      else exibirELiberar();
      return;
    }
    exibirELiberar();
  }

  function atualizarInterface() {
    const papel = funcao?.value;
    const showResto = Boolean(papel);
    if (resto) resto.hidden = !showResto;
    setRequiredAndDisabled(showResto);

    if (blocoPlaca && placaSelect) {
      toggleSection(blocoPlaca, showResto);
      if (showResto) placaSelect.setAttribute("required", "required");
      else { placaSelect.removeAttribute("required"); placaSelect.value = ""; }
    }

    if (papel === "motorista") {
      temAjudante?.setAttribute("required", "required");
      if (temAjudante && (temAjudante.value !== "sim" && temAjudante.value !== "nao")) {
        temAjudante.value = "";
      }
    } else {
      temAjudante?.removeAttribute("required");
      if (temAjudante) temAjudante.value = "";
    }

    toggleSection(areaMotorista, papel === "motorista");
    toggleSection(areaAjudante, papel === "ajudante");

    if (papel === "motorista") {
      const tem = temAjudante?.value === "sim";
      toggleSection(blocoAjudanteDoMotorista, tem);
    } else {
      toggleSection(blocoAjudanteDoMotorista, false);
    }

    aplicarRegraValeDescarga(papel);

    if (showResto) {
      const firstFocusable = resto.querySelector("input:not([disabled]), select:not([disabled])");
      firstFocusable?.focus();
    }
  }

  funcao?.addEventListener("change", atualizarInterface);
  temAjudante?.addEventListener("change", atualizarInterface);
  atualizarInterface();
});

// ===== Validação Amigável =====
(() => {
  const form = document.getElementById('formPernoite');
  if (!form) return;

  const FIELD_SELECTOR = 'input, select, textarea';

  const validators = {
    email: (el) => {
      const value = String(el.value || '').trim();
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !value) return 'Informe o e-mail.';
      if (value && !isValidEmail(value)) return 'Informe um e-mail válido (ex.: nome@empresa.com).';
      return null;
    },
    data_registro: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Informe a data.';
      return null;
    },
    romaneio: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !String(el.value || '').trim()) return 'Informe o romaneio / ordem de coleta.';
      return null;
    },
    uf: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Selecione a UF.';
      return null;
    },
    cidade: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !String(el.value || '').trim()) return 'Informe a cidade.';
      return null;
    },
    nome_motorista: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Selecione o motorista.';
      return null;
    },
    nome_ajudante: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Selecione o ajudante.';
      return null;
    },
    motorista_responsavel: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Selecione o motorista responsável.';
      return null;
    },
    tem_ajudante: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Selecione se estava com ajudante.';
      return null;
    },
    placa: (el) => {
      if (isDisabledOrHidden(el)) return null;
      if (isRequired(el) && !el.value) return 'Selecione o veículo/placa.';
      return null;
    },
  };

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }
  function isRequired(el) {
    return el.hasAttribute('required') || el.hasAttribute('data-required');
  }
  function isDisabledOrHidden(el) {
    if (el.disabled) return true;
    let node = el;
    while (node && node !== document.body) {
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }
  function ensureHint(el) {
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
    if (!msg) el.classList.add('is-valid');
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function validateField(el) {
    const nameOrId = el.name || el.id;
    const rule = validators[nameOrId];
    let msg = null;
    if (typeof rule === 'function') {
      msg = rule(el);
    } else {
      if (!isDisabledOrHidden(el) && isRequired(el)) {
        const value = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : String(el.value || '').trim();
        if (!value) msg = 'Preencha este campo.';
      }
    }
    showError(el, msg);
    return !msg;
  }
  function validateForm() {
    const fields = Array.from(form.querySelectorAll(FIELD_SELECTOR));
    let firstInvalid = null;
    for (const el of fields) {
      if ((!el.name && !el.id) || isDisabledOrHidden(el)) continue;
      const ok = validateField(el);
      if (!ok && !firstInvalid) firstInvalid = el;
    }
    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  form.addEventListener('input', (e) => {
    if (e.target instanceof HTMLElement && e.target.matches?.(FIELD_SELECTOR)) validateField(e.target);
  });
  form.addEventListener('change', (e) => {
    if (e.target instanceof HTMLElement && e.target.matches?.(FIELD_SELECTOR)) validateField(e.target);
  });

  // ===== Envio via fetch =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      const data = Object.fromEntries(
        Array.from(new FormData(form).entries())
      );

      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Erro ao enviar registro.');
      }

      // Sucesso — mostra tela de confirmação
      mostrarSucesso();

    } catch (err) {
      mostrarErro(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  function mostrarSucesso() {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
        <h2 style="margin-bottom: 12px;">Registro enviado com sucesso!</h2>
        <p style="color: #555; margin-bottom: 8px;">Suas informações foram salvas corretamente.</p>
        <p style="color: #555; margin-bottom: 32px;">Um e-mail de confirmação foi enviado para você.</p>
        <button onclick="location.reload()"
          style="padding: 12px 28px; background: #2563eb; color: #fff;
                 border: none; border-radius: 8px; font-size: 15px; cursor: pointer;">
          Enviar novo registro
        </button>
      </div>
    `;
  }

  function mostrarErro(msg) {
    let toast = document.getElementById('toast-erro');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-erro';
      toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #dc2626; color: #fff; padding: 14px 24px; border-radius: 8px;
        font-size: 14px; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 5000);
  }
})();

// ===== Cidades por UF (via IBGE) =====
(() => {
  const ufEl = document.getElementById('uf');
  const cityEl = document.getElementById('cidade');
  const API_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados';
  const cityCache = new Map();

  if (!ufEl || !cityEl) return;

  function resetCitySelect(placeholder = 'Selecione a UF primeiro') {
    cityEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    cityEl.appendChild(opt);
    cityEl.value = '';
    cityEl.setAttribute('disabled', 'disabled');
  }

  function sortByNameBR(list) {
    return list.slice().sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );
  }

  function fillCities(cities) {
    cityEl.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Selecionar cidade';
    cityEl.appendChild(first);
    sortByNameBR(cities).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nome;
      opt.textContent = c.nome;
      cityEl.appendChild(opt);
    });
    cityEl.removeAttribute('disabled');
  }

  async function fetchCitiesByUF(uf) {
    if (cityCache.has(uf)) return cityCache.get(uf);
    const res = await fetch(`${API_BASE}/${uf}/municipios`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
    const data = await res.json();
    const simple = data.map(({ id, nome }) => ({ id, nome }));
    cityCache.set(uf, simple);
    return simple;
  }

  async function onUFChange() {
    const uf = ufEl.value;
    if (!uf) { resetCitySelect('Selecione a UF primeiro'); return; }
    resetCitySelect('Carregando cidades...');
    cityEl.removeAttribute('disabled');
    try {
      const cities = await fetchCitiesByUF(uf);
      if (!cities || !cities.length) { resetCitySelect('Nenhuma cidade encontrada'); return; }
      fillCities(cities);
    } catch (err) {
      console.error('Erro ao buscar cidades do IBGE:', err);
      resetCitySelect('Falha ao carregar. Tente novamente.');
    }
  }

  ufEl.addEventListener('change', onUFChange);
  if (ufEl.value) onUFChange().catch(() => {});
  else resetCitySelect();
})();