// Shared auth utilities

function getToken() {
    return localStorage.getItem("auth_token");
}

function getUser() {
    var user = localStorage.getItem("auth_user");
    return user ? JSON.parse(user) : null;
}

function saveAuth(token, user) {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
}

function authHeaders() {
    var token = getToken();
    return token ? { "Authorization": "Bearer " + token } : {};
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!getToken()) {
        window.location.href = "/login.html";
    }
}

// Redirect away from login/signup if already authenticated
function redirectIfLoggedIn() {
    if (getToken()) {
        window.location.href = "/dashboard.html";
    }
}

function logout() {
    clearAuth();
    window.location.href = "/login.html";
}
