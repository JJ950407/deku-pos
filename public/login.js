const form = document.getElementById("loginForm");
const errorEl = document.getElementById("loginError");
const kitchenButton = document.getElementById("kitchenButton");

if (kitchenButton) {
  kitchenButton.addEventListener("click", () => {
    window.location.href = "/kitchen/";
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const usernameRaw = document.getElementById("username").value;
  const passwordRaw = document.getElementById("password").value;
  const username = usernameRaw.trim().toLowerCase();
  const password = passwordRaw.trim();

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      errorEl.textContent = "Usuario o contraseña incorrectos.";
      return;
    }

    window.location.href = "/";
  } catch (error) {
    console.error(error);
    errorEl.textContent = "No se pudo iniciar sesión.";
  }
});
