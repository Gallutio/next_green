(function () {
    var links = [
        { href: "index.html", label: "Home" },
        { href: "dashboard.html", label: "Dashboard", auth: true },
        { href: "chat.html", label: "Chat", auth: true },
        { href: "learn.html", label: "Learn" },
        { href: "compare.html", label: "Compare" },
        { href: "log.html", label: "Logs", auth: true },
        { href: "about.html", label: "About" },
        { href: "contactus.html", label: "Contact" }
    ];

    function currentPage() {
        var path = window.location.pathname.split("/").pop();
        return path || "index.html";
    }

    function loggedIn() {
        try { return !!localStorage.getItem("auth_token"); } catch (e) { return false; }
    }

    function buildNav() {
        var here = currentPage();
        var authed = loggedIn();

        var items = links.map(function (link) {
            var cls = "site-nav-link" + (link.href === here ? " active" : "");
            return '<li><a class="' + cls + '" href="' + link.href + '">' + link.label + "</a></li>";
        }).join("");

        var authItem = authed
            ? '<li><a class="site-nav-link site-nav-auth" href="#" id="siteNavLogout">Log out</a></li>'
            : '<li><a class="site-nav-link site-nav-auth" href="login.html">Log in</a></li>';

        return (
            '<div class="site-nav-inner">' +
                '<a class="site-brand" href="index.html">' +
                    '<img class="site-brand-logo" src="assets/images/logo.png" alt="NextGreen logo">' +
                    '<span class="site-brand-name">NextGreen</span>' +
                '</a>' +
                '<button class="site-nav-toggle" aria-label="Menu" id="siteNavToggle">' +
                    '<span></span><span></span><span></span>' +
                '</button>' +
                '<ul class="site-nav-links" id="siteNavLinks">' + items + authItem + "</ul>" +
            "</div>"
        );
    }

    function buildFooter() {
        var year = new Date().getFullYear();
        return (
            '<div class="site-footer-inner">' +
                '<p class="site-footer-brand">NextGreen</p>' +
                '<p class="site-footer-tag">Track today. Transform tomorrow.</p>' +
                '<p class="site-footer-meta">' +
                    '&copy; ' + year + ' &middot; Grade 9 Computer Programming Project &middot; ' +
                    '<a href="contactus.html">Contact</a>' +
                '</p>' +
            "</div>"
        );
    }

    function wireNav() {
        var toggle = document.getElementById("siteNavToggle");
        var linksEl = document.getElementById("siteNavLinks");
        if (toggle && linksEl) {
            toggle.addEventListener("click", function () {
                linksEl.classList.toggle("open");
                toggle.classList.toggle("open");
            });
        }

        var logoutLink = document.getElementById("siteNavLogout");
        if (logoutLink) {
            logoutLink.addEventListener("click", function (e) {
                e.preventDefault();
                if (typeof logout === "function") {
                    logout();
                } else {
                    try { localStorage.removeItem("auth_token"); localStorage.removeItem("auth_user"); } catch (err) {}
                    window.location.href = "login.html";
                }
            });
        }
    }

    function mount() {
        var header = document.getElementById("site-header");
        if (header) header.innerHTML = buildNav();

        var footer = document.getElementById("site-footer");
        if (footer) footer.innerHTML = buildFooter();

        wireNav();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount);
    } else {
        mount();
    }
})();
