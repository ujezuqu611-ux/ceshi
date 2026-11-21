// 本地直进补丁：移除登录 / 激活码 / 导入解锁码拦截（不改动原业务逻辑）
(function () {
    function hideAuthOverlay() {
        try {
            localStorage.setItem('app_login_state', 'logged_in');
            localStorage.setItem('ios_theme_activation_v2_fallback', 'true');
        } catch (e) {}
        var o = document.getElementById('activation-overlay');
        if (o) o.style.display = 'none';
    }

    // 覆盖原激活检查：直接放行进入主界面
    window.checkAndShowActivation = async function () {
        hideAuthOverlay();
    };

    // 覆盖角色卡导入解锁校验：直接放行导入
    window.wcIsImportUnlocked = async function () {
        return true;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideAuthOverlay);
    } else {
        hideAuthOverlay();
    }
    window.addEventListener('load', hideAuthOverlay);
})();
