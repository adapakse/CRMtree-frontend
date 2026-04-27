// Shared navigation helper — included by all mockups
const NAV = [
  { icon:'🏠', label:'Dashboard',    href:'dashboard.html',       section:null },
  { icon:'📁', label:'Dokumenty',    href:'documents.html',       section:null },
  { icon:'✅', label:'Workflow',     href:'workflow.html',        section:null },
  { icon:'👤', label:'Leady',        href:'leads_list.html',      section:'CRM' },
  { icon:'🏢', label:'Klienci',      href:'clients_list.html',    section:'CRM' },
  { icon:'🚀', label:'Onboarding',   href:'onboarding.html',      section:'CRM' },
  { icon:'📊', label:'Raporty',      href:'reports.html',         section:'CRM' },
  { icon:'📅', label:'Kalendarz',    href:'calendar.html',        section:'CRM' },
  { icon:'📧', label:'Email – nowy', href:'email_compose.html',   section:'CRM' },
  { icon:'💬', label:'Email – wątek',href:'email_thread.html',    section:'CRM' },
  { icon:'⚙️', label:'Ustawienia',   href:'admin_settings.html',  section:'Admin' },
];

function renderNav(activePage) {
  let lastSection = null;
  let html = `<div class="logo">x<span>-CRM</span></div>`;
  for (const item of NAV) {
    if (item.section && item.section !== lastSection) {
      html += `<div class="sec-label">${item.section}</div>`;
      lastSection = item.section;
    } else if (!item.section && lastSection !== '') {
      lastSection = '';
    }
    const active = item.href === activePage ? ' active' : '';
    html += `<a href="${item.href}" class="${active}">${item.icon} ${item.label}</a>`;
  }
  return html;
}
