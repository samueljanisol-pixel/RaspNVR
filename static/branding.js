async function loadBranding() {
  try {
    const res = await fetch('/api/system/settings');
    if (!res.ok) return;
    const data = await res.json();
    const name = data.app_name || 'RaspNVR';
    document.querySelectorAll('[data-app-name]').forEach((el) => {
      el.textContent = name;
    });
    if (document.title.includes('RaspNVR')) {
      document.title = document.title.replace('RaspNVR', name);
    }
  } catch {
    /* ignore */
  }
}

loadBranding();
