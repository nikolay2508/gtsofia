(() => {
  const STORAGE_KEY = "gtsofia.themePreference";
  const VALID_PREFERENCES = new Set(["auto", "light", "dark"]);
  const mediaQuery = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function readPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID_PREFERENCES.has(saved) ? saved : "auto";
    } catch {
      return "auto";
    }
  }

  let preference = readPreference();

  function getActiveTheme() {
    if (preference === "auto") {
      return mediaQuery?.matches ? "dark" : "light";
    }
    return preference;
  }

  function applyTheme() {
    const activeTheme = getActiveTheme();
    document.documentElement.dataset.theme = activeTheme;
    document.documentElement.style.colorScheme = activeTheme;
    window.dispatchEvent(new CustomEvent("gtsofia:themechange", {
      detail: { theme: activeTheme, preference }
    }));
    updateSettingsControls();
  }

  // Apply the saved/system theme before the stylesheet paints to avoid a flash.
  applyTheme();

  function savePreference(nextPreference) {
    if (!VALID_PREFERENCES.has(nextPreference)) return;
    preference = nextPreference;
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // The selected theme still works for this page if storage is unavailable.
    }
    applyTheme();
  }

  function updateSettingsControls() {
    const root = document.getElementById("siteSettings");
    if (!root) return;

    root.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const isSelected = button.dataset.themeChoice === preference;
      button.setAttribute("aria-checked", String(isSelected));
      button.classList.toggle("is-selected", isSelected);
    });

    const description = root.querySelector("#siteThemeDescription");
    if (description) {
      const descriptions = {
        auto: "Следва настройката за външен вид на устройството.",
        light: "Сайтът винаги ще използва светла тема.",
        dark: "Сайтът винаги ще използва тъмна тема."
      };
      description.textContent = descriptions[preference];
    }
  }

  function mountSettings() {
    if (!document.body || document.getElementById("siteSettings")) return;

    const settings = document.createElement("div");
    settings.id = "siteSettings";
    settings.className = "site-settings";
    settings.innerHTML = `
      <section
        class="site-settings-panel"
        id="siteSettingsPanel"
        role="dialog"
        aria-labelledby="siteSettingsTitle"
        aria-modal="false"
        hidden
      >
        <div class="site-settings-heading">
          <h2 id="siteSettingsTitle">Настройки</h2>
          <button class="site-settings-close" id="siteSettingsClose" type="button" aria-label="Затвори настройките">&times;</button>
        </div>
        <div class="site-settings-section">
          <h3>Тема на сайта</h3>
          <div class="site-theme-options" role="radiogroup" aria-label="Избор на тема">
            <button class="site-theme-option" type="button" role="radio" data-theme-choice="auto" aria-checked="true">
              <span class="site-theme-option-icon" aria-hidden="true">◐</span>
              <span>Автоматична</span>
            </button>
            <button class="site-theme-option" type="button" role="radio" data-theme-choice="light" aria-checked="false">
              <span class="site-theme-option-icon" aria-hidden="true">☀</span>
              <span>Светла</span>
            </button>
            <button class="site-theme-option" type="button" role="radio" data-theme-choice="dark" aria-checked="false">
              <span class="site-theme-option-icon" aria-hidden="true">☾</span>
              <span>Тъмна</span>
            </button>
          </div>
          <p class="site-settings-description" id="siteThemeDescription">Следва настройката за външен вид на устройството.</p>
        </div>
      </section>
      <button
        class="site-settings-toggle"
        id="siteSettingsToggle"
        type="button"
        aria-label="Отвори настройките"
        title="Настройки"
        aria-expanded="false"
        aria-controls="siteSettingsPanel"
      >
        <span class="site-settings-toggle-icon" aria-hidden="true">⚙</span>
      </button>
    `;

    document.body.appendChild(settings);

    const toggle = settings.querySelector("#siteSettingsToggle");
    const panel = settings.querySelector("#siteSettingsPanel");
    const closeButton = settings.querySelector("#siteSettingsClose");

    function setPanelOpen(isOpen) {
      panel.hidden = !isOpen;
      toggle.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) {
        settings.querySelector(`[data-theme-choice="${preference}"]`)?.focus();
      }
    }

    toggle.addEventListener("click", () => {
      setPanelOpen(panel.hidden);
    });

    closeButton.addEventListener("click", () => {
      setPanelOpen(false);
      toggle.focus();
    });

    settings.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        savePreference(button.dataset.themeChoice);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const options = [...settings.querySelectorAll("[data-theme-choice]")];
        const index = options.indexOf(button);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        options[(index + direction + options.length) % options.length].focus();
      });
    });

    document.addEventListener("click", (event) => {
      if (!settings.contains(event.target)) setPanelOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        setPanelOpen(false);
        toggle.focus();
      }
    });

    updateSettingsControls();
  }

  if (mediaQuery) {
    const onSystemThemeChange = () => {
      if (preference === "auto") applyTheme();
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onSystemThemeChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(onSystemThemeChange);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSettings, { once: true });
  } else {
    mountSettings();
  }
})();
