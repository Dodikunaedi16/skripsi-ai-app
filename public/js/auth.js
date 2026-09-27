function showAuthError(message) {
  const box = document.getElementById("errorMsg");
  if (!box) return;
  box.textContent = message;
  box.style.display = "block";
}

async function submitAuth(url, payload) {
  const errorBox = document.getElementById("errorMsg");
  const button = document.getElementById("submitBtn");
  if (errorBox) errorBox.style.display = "none";
  if (button) {
    button.disabled = true;
    button.classList.add("is-loading");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
    window.location.href = "/index.html";
  } catch (err) {
    showAuthError(err.message || "Tidak dapat memproses permintaan.");
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }
}
