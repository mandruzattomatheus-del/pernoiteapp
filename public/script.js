const horaExtra = document.getElementById("horaExtra");
const extraFields = document.getElementById("extraFields");

horaExtra.addEventListener("change", () => {
  if (horaExtra.value === "sim") {
    extraFields.classList.add("ativo");
  } else {
    extraFields.classList.remove("ativo");
  }
});

document.getElementById("formPernoite").addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const dados = Object.fromEntries(formData.entries());

  await fetch("/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados)
  });

  alert("Enviado com sucesso!");
});