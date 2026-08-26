const toggleBtn = document.getElementById("toggle");
const apiKeyInput = document.getElementById("apiKey");
const intervalInput = document.getElementById("interval");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

let enabled = true;

// Load saved settings
chrome.storage.local.get({ apiKey: "", enabled: true, scanInterval: 5 }, (data) => {
  apiKeyInput.value = data.apiKey;
  intervalInput.value = data.scanInterval;
  enabled = data.enabled;
  updateToggle();
});

// Toggle
toggleBtn.addEventListener("click", () => {
  enabled = !enabled;
  updateToggle();
});

function updateToggle() {
  toggleBtn.classList.toggle("on", enabled);
}

// Save
saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const scanInterval = Math.max(3, Math.min(60, parseInt(intervalInput.value) || 5));

  chrome.storage.local.set({ apiKey, enabled, scanInterval }, () => {
    statusEl.textContent = "✓ Saved — reload DexScreener tab to apply";
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  });
});
