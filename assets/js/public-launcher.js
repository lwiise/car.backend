(function initPublicLauncher() {
  const authBtn = document.getElementById("authNavBtn");
  if (!authBtn || document.getElementById("menuTrigger") || document.getElementById("appLauncher")) return;

  function wrapSvg(markup) {
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none">${markup}</svg>`;
  }

  const launcherItems = [
    {
      label: "Dashboard",
      href: "/dashboard.html",
      icon: wrapSvg('<rect x="10" y="10" width="18" height="18" rx="3" fill="#9D568E"/><rect x="40" y="10" width="14" height="10" rx="3" fill="#FF7D87"/><rect x="40" y="24" width="14" height="10" rx="3" fill="#FF6A23"/><rect x="10" y="36" width="18" height="18" rx="3" fill="#2A86F6"/><rect x="34" y="38" width="8" height="16" rx="3" fill="#25C7A7"/><rect x="46" y="38" width="8" height="16" rx="3" fill="#14A88E"/>')
    },
    {
      label: "PPM",
      href: "/ppm/index.html",
      icon: wrapSvg('<path d="M10 23c0-2 2-4 4-4h18l-6 16H14c-2 0-4-2-4-4v-8Z" fill="#27C8BE"/><rect x="27" y="17" width="18" height="18" rx="5" transform="rotate(45 27 17)" fill="#96508C"/><rect x="21" y="17" width="18" height="18" rx="5" transform="rotate(45 21 17)" fill="#0B8B94"/><rect x="33" y="33" width="18" height="8" rx="4" transform="rotate(45 33 33)" fill="#2CC9C8"/>')
    },
    {
      label: "CLA",
      href: "/cla.html",
      icon: wrapSvg('<circle cx="20" cy="22" r="5" fill="#F6B13A"/><circle cx="48" cy="20" r="5" fill="#27C8BE"/><circle cx="46" cy="46" r="5" fill="#9D568E"/><path d="M32 14c-7 0-12 5-12 12 0 9 12 24 12 24s12-15 12-24c0-7-5-12-12-12Z" fill="#FF7D87"/><circle cx="32" cy="26" r="5" fill="#fff"/>')
    },
    {
      // CRM is the customer/sales-side workspace — rendered with a
      // money / coin-stack icon per design request. Same UI shell as
      // PPM but with isolated data (workspace="crm" on the leads).
      label: "CRM",
      href: "/crm/index.html",
      icon: wrapSvg('<ellipse cx="32" cy="20" rx="20" ry="6" fill="#F6B13A" stroke="#9D568E" stroke-width="2"/><ellipse cx="32" cy="32" rx="20" ry="6" fill="#FF950D" stroke="#9D568E" stroke-width="2"/><ellipse cx="32" cy="44" rx="20" ry="6" fill="#27C8BE" stroke="#9D568E" stroke-width="2"/>')
    },
    {
      label: "Sign",
      href: "/auth.html",
      icon: wrapSvg('<path d="M15 30c3-11 8-18 13-18 6 0 8 8 8 18 0 12-4 18-8 18-3 0-5-2-6-6" stroke="#0C7395" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 36c7-7 14-7 19 0 4 4 7 4 11 0" stroke="#0C7395" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 40h20" stroke="#33B4F4" stroke-width="4.2" stroke-linecap="round"/>')
    },
    {
      label: "Studio",
      href: "/dashboard.html#studio",
      icon: wrapSvg('<rect x="12" y="29" width="40" height="9" rx="4.5" transform="rotate(-45 12 29)" fill="#39B8F4"/><rect x="27" y="15" width="40" height="9" rx="4.5" transform="rotate(45 27 15)" fill="#9B568F"/><path d="M15 18h9v9" stroke="#9B568F" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>')
    },
    {
      label: "Subscriptions",
      href: "/dashboard.html#subscriptions",
      icon: wrapSvg('<path d="M18 18a20 20 0 0 0 0 28" stroke="#FF950D" stroke-width="6" stroke-linecap="round"/><path d="M46 18a20 20 0 0 1 0 28" stroke="#12B89B" stroke-width="6" stroke-linecap="round"/><path d="M18 18a20 20 0 0 1 28 0" stroke="#F3B33C" stroke-width="6" stroke-linecap="round" stroke-dasharray="18 40"/><circle cx="18" cy="18" r="5.5" fill="#F99D1A"/><circle cx="46" cy="46" r="5.5" fill="#12B89B"/>')
    },
    {
      label: "AI",
      href: "/dashboard.html#ai",
      icon: wrapSvg('<path d="M12 46 26 14l8 18" stroke="#8E4D87" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 15 42 46" stroke="#F6AF38" stroke-width="7" stroke-linecap="round"/><path d="M49 14v32" stroke="#F5AF39" stroke-width="7" stroke-linecap="round"/><path d="M15 40c4-5 8-7 13-7" stroke="#9B568F" stroke-width="7" stroke-linecap="round"/>')
    },
    {
      label: "Point of Sale",
      href: "/dashboard.html#point-of-sale",
      icon: wrapSvg('<path d="M12 24h40l-4 18a6 6 0 0 1-6 5H22a6 6 0 0 1-6-5l-4-18Z" fill="#F8B13B"/><path d="M19 24h8l-2 23h-5a6 6 0 0 1-6-5l5-18Z" fill="#9C568F"/><path d="M37 24h8l5 18a6 6 0 0 1-6 5h-5l-2-23Z" fill="#9C568F"/><path d="M12 24c0-7 4-12 10-12h20c6 0 10 5 10 12" stroke="#F8B13B" stroke-width="4" stroke-linecap="round"/>')
    },
    {
      label: "Discuss",
      href: "/dashboard.html#discuss",
      icon: wrapSvg('<path d="M18 14c-4 4-6 10-6 17v14a4 4 0 0 0 4 4h16c14 0 24-8 24-21 0-14-11-24-24-24-6 0-11 2-14 6Z" fill="#FF7F0F"/><path d="M28 18c10 0 18 8 18 18 0 5-2 9-6 13 10-3 16-10 16-20 0-14-11-24-24-24-6 0-11 2-14 6 3-1 6-2 10-2Z" fill="#FF6A23" opacity=".55"/>')
    },
    {
      label: "Documents",
      href: "/dashboard.html#documents",
      icon: wrapSvg('<rect x="12" y="13" width="24" height="34" rx="5" fill="#38B6F5"/><rect x="30" y="20" width="24" height="30" rx="5" transform="rotate(45 30 20)" fill="#FFB03A"/><rect x="24" y="19" width="16" height="34" rx="4" transform="rotate(12 24 19)" fill="#1578A5" opacity=".88"/>')
    },
    {
      label: "Project",
      href: "/projects.html",
      icon: wrapSvg('<rect x="12" y="34" width="18" height="10" rx="2" transform="rotate(-40 12 34)" fill="#96508C"/><rect x="26" y="16" width="16" height="32" rx="3" transform="rotate(40 26 16)" fill="#2CC8C7"/><rect x="20" y="38" width="11" height="10" rx="2" transform="rotate(40 20 38)" fill="#0A5D78"/>')
    },
    {
      label: "Timesheets",
      href: "/dashboard.html#timesheets",
      icon: wrapSvg('<circle cx="32" cy="32" r="24" fill="#3DB6F3"/><path d="M18 14a24 24 0 0 0 0 36" stroke="#FF7D87" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="32" r="20" fill="#1A6A98"/><path d="M32 32 19 19" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="#fff"/>')
    },
    {
      label: "Field Service",
      href: "/dashboard.html#field-service",
      icon: wrapSvg('<path d="M14 39 46 12 36 50 30 34 14 39Z" fill="#FFAF38"/><path d="M12 36 34 14l-4 22-18 0Z" fill="#9B568F"/><path d="m27 34 11 4" stroke="#FF5867" stroke-width="8" stroke-linecap="round"/>')
    },
    {
      label: "Planning",
      href: "/dashboard.html#planning",
      icon: wrapSvg('<rect x="10" y="17" width="20" height="30" rx="5" fill="#F6B13A"/><rect x="34" y="17" width="20" height="30" rx="5" fill="#28C9C6"/><rect x="30" y="12" width="4" height="40" rx="2" fill="#9A568E"/><path d="m24 24-8 6 8 6V24Z" fill="#fff"/><path d="m40 24 8 6-8 6V24Z" fill="#fff"/>')
    },
    {
      label: "Helpdesk",
      href: "/dashboard.html#helpdesk",
      icon: wrapSvg('<path d="M24 14h12a4 4 0 0 1 4 4v10h10a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H38V38H26v10H14a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4h10V18a4 4 0 0 1 4-4Z" fill="#1C7A76"/><path d="M24 14h12a4 4 0 0 1 4 4v10h10a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H38V38H26v10H14a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4h10V18a4 4 0 0 1 4-4Z" fill="#2CC8C7" transform="translate(-10 10)" opacity=".92"/><path d="M28 18h8v10h10v8H36v10h-8V36H18v-8h10V18Z" fill="#fff"/>')
    },
    {
      label: "Website",
      href: "/index.html",
      icon: wrapSvg('<path d="M12 28c8-12 17-18 27-18 8 0 13 4 13 10 0 6-5 10-13 10-10 0-19-6-27-2Z" fill="#27C9C7"/><path d="M12 36c8 12 17 18 27 18 8 0 13-4 13-10 0-6-5-10-13-10-10 0-19 6-27 2Z" fill="#38B6F5"/><path d="M12 28c7 7 15 10 23 10 8 0 13-3 17-8" stroke="#1A5C7A" stroke-width="7" stroke-linecap="round"/>')
    },
    {
      label: "Social Marketing",
      href: "/dashboard.html#social-marketing",
      icon: wrapSvg('<path d="M20 18c-6 0-11 5-11 11 0 8 7 13 23 26 16-13 23-18 23-26 0-6-5-11-11-11-5 0-9 2-12 6-3-4-7-6-12-6Z" fill="#FF7D87"/><path d="M32 24c3-4 7-6 12-6 6 0 11 5 11 11 0 8-7 13-23 26" fill="#F7B13B"/><path d="M20 18 44 42" stroke="#FF6A23" stroke-width="8" stroke-linecap="round"/>')
    },
    {
      label: "Email Marketing",
      href: "/dashboard.html#email-marketing",
      icon: wrapSvg('<path d="M12 37 48 12 42 56 31 43 12 37Z" fill="#38B6F5"/><path d="M31 43 48 12 54 56 31 43Z" fill="#8F4E88"/><path d="M18 36 48 12" stroke="#1F6DA0" stroke-width="6" stroke-linecap="round"/>')
    },
    {
      label: "Purchase",
      href: "/dashboard.html#purchase",
      icon: wrapSvg('<rect x="10" y="17" width="44" height="30" rx="4" fill="#98508A"/><rect x="10" y="17" width="44" height="11" rx="4" fill="#25C7C5"/><rect x="10" y="28" width="44" height="7" fill="#136E8F"/>')
    },
    {
      label: "Inventory",
      href: "/dashboard.html#inventory",
      icon: wrapSvg('<path d="m32 10 18 11v22L32 54 14 43V21l18-11Z" fill="#96508C"/><path d="m14 21 18-11 8 5-18 11-8-5Z" fill="#FFB03A"/><path d="m14 21 8 5v20l-8-5V21Z" fill="#FF9320"/><path d="m22 15 8-5 8 5-8 5-8-5Z" fill="#FF7B1A"/>')
    },
    {
      label: "Manufacturing",
      href: "/dashboard.html#manufacturing",
      icon: wrapSvg('<path d="M10 26 32 18v28H10V26Z" fill="#25C7A7"/><path d="M22 22 44 14v32H22V22Z" fill="#147A76" opacity=".94"/><path d="M34 26 50 20v26H34V26Z" fill="#FF7D87" opacity=".9"/><path d="M46 30 58 25v21H46V30Z" fill="#F6B13A"/>')
    },
    {
      label: "Sales",
      href: "/dashboard.html#sales",
      icon: wrapSvg('<rect x="10" y="28" width="16" height="22" rx="4" fill="#8F4E87"/><rect x="24" y="20" width="16" height="30" rx="4" fill="#CB577D"/><rect x="38" y="8" width="16" height="42" rx="4" fill="#F6B13A"/><path d="M18 48V28M32 48V20M46 48V8" stroke="#fff" stroke-width="2" opacity=".22"/>')
    },
    {
      label: "HR",
      href: "/dashboard.html#hr",
      icon: wrapSvg('<circle cx="32" cy="16" r="10" fill="#9D568E"/><circle cx="12" cy="24" r="5.5" fill="#F6B13A"/><circle cx="52" cy="24" r="5.5" fill="#25C7C5"/><path d="M9 30h18c7 0 13 6 13 13v5H9a7 7 0 0 1-7-7v-4c0-4 3-7 7-7Z" fill="#F6B13A"/><path d="M27 30h18c4 0 7 3 7 7v4a7 7 0 0 1-7 7H27v-18Z" fill="#25C7C5"/><path d="M18 30h14c5 0 9 4 9 9v9H18c-5 0-9-4-9-9s4-9 9-9Z" fill="#9D568E"/>')
    }
  ];

  const trigger = document.createElement("button");
  trigger.className = "menu-trigger";
  trigger.id = "menuTrigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "appLauncher");
  trigger.setAttribute("aria-label", "Open applications menu");
  trigger.innerHTML = `
    <span class="menu-trigger-dots" aria-hidden="true">
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
    </span>
  `;

  const overlay = document.createElement("div");
  overlay.id = "appLauncher";
  overlay.className = "launcher-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="launcher-shell">
      <div class="launcher-panel" role="dialog" aria-modal="true" aria-label="Applications">
        <div class="launcher-grid" id="appLauncherGrid"></div>
      </div>
    </div>
  `;

  const grid = overlay.querySelector("#appLauncherGrid");
  grid.innerHTML = launcherItems.map((item) => (
    `<a class="launcher-card" href="${item.href}" aria-label="${item.label}">
      <div class="launcher-icon-box" aria-hidden="true">${item.icon}</div>
      <span>${item.label}</span>
    </a>`
  )).join("");

  authBtn.replaceWith(trigger);
  document.body.appendChild(overlay);

  function setLauncherState(open) {
    overlay.classList.toggle("is-open", open);
    trigger.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", open ? "Close applications menu" : "Open applications menu");
    overlay.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("menu-open", open);
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setLauncherState(!overlay.classList.contains("is-open"));
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setLauncherState(false);
    }
  });

  grid.addEventListener("click", (event) => {
    if (event.target.closest(".launcher-card")) {
      setLauncherState(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setLauncherState(false);
    }
  });
})();
