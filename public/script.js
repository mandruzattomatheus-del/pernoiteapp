const selectFuncao = document.getElementById("funcao");
const areaMotorista = document.getElementById("areaMotorista");
const areaAjudante = document.getElementById("areaAjudante");
const blocoValeDescarga = document.getElementById("blocoValeDescarga");
const selectTemAjudante = document.getElementById("temAjudante");
const blocoAjudanteDoMotorista = document.getElementById("blocoAjudanteDoMotorista");

selectFuncao.addEventListener("change", () => {
    // 1. Limpa as seções de cargo para evitar repetição
    areaMotorista.classList.add("hidden-section");
    areaAjudante.classList.add("hidden-section");
    
    // 2. Lógica de visibilidade por função
    if (selectFuncao.value === "ajudante") {
        areaAjudante.classList.remove("hidden-section");
        blocoValeDescarga.classList.add("hidden-section"); // Esconde Vale Descarga
    } else if (selectFuncao.value === "motorista") {
        areaMotorista.classList.remove("hidden-section");
        blocoValeDescarga.classList.remove("hidden-section"); // Mostra Vale Descarga
    } else {
        // Se voltar para o "Selecione", mostra o padrão
        blocoValeDescarga.classList.remove("hidden-section");
    }
});

// Lógica de ajuda dentro da área do motorista
selectTemAjudante.addEventListener("change", () => {
    if (selectTemAjudante.value === "sim") {
        blocoAjudanteDoMotorista.classList.remove("hidden-section");
    } else {
        blocoAjudanteDoMotorista.classList.add("hidden-section");
    }
});