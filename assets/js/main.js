(() => {
  const body = document.body;
  const themeButton = document.querySelector(".theme-toggle");
  const themeIcon = document.querySelector(".theme-icon");
  const savedTheme = localStorage.getItem("clouddock-theme");
  if (savedTheme === "light") body.classList.add("light");
  const updateThemeIcon = () => { themeIcon.textContent = body.classList.contains("light") ? "☾" : "☼"; };
  updateThemeIcon();
  themeButton.addEventListener("click", () => {
    body.classList.toggle("light");
    const theme = body.classList.contains("light") ? "light" : "dark";
    localStorage.setItem("clouddock-theme", theme);
    updateThemeIcon();
  });
  const menuButton = document.querySelector(".mobile-menu");
  const navLinks = document.querySelector(".nav-links");
  menuButton.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  navLinks.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }));
  document.querySelector("#year").textContent = new Date().getFullYear();
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", event => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
})();