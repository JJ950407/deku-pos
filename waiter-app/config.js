(function () {
  const stored = localStorage.getItem("DEKU_BACKEND_URL");
  window.DEKU_CONFIG = {
    baseUrl: stored || "http://localhost:3000"
  };
})();
